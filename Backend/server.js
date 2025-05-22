const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors({ 
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// PostgreSQL configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'new_employee_db',
    password: 'Password@12345',
    port: 5432
});

// Test database connection
async function testDbConnection() {
    try {
        const client = await pool.connect();
        console.log('Successfully connected to PostgreSQL database: new_employee_db');
        client.release();
    } catch (err) {
        console.error('Failed to connect to PostgreSQL:', err.message, err.stack);
        process.exit(1);
    }
}

// Create number_to_words function and payslips table
async function createTable() {
    const createFunctionQuery = `
        CREATE OR REPLACE FUNCTION number_to_words(num INTEGER) RETURNS TEXT AS $$
        DECLARE
            units TEXT[] := ARRAY['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
            teens TEXT[] := ARRAY['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            tens TEXT[] := ARRAY['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
            thousands TEXT[] := ARRAY['', 'Thousand', 'Million', 'Billion'];
            result TEXT := '';
            chunk INTEGER;
            chunk_index SMALLINT := 0;
        BEGIN
            IF num = 0 THEN
                RETURN 'Zero only';
            END IF;

            WHILE num > 0 LOOP
                chunk := num % 1000;
                IF chunk > 0 THEN
                    DECLARE
                        chunk_result TEXT := '';
                        hundreds INTEGER := chunk / 100;
                        tens_units INTEGER := chunk % 100;
                    BEGIN
                        IF hundreds > 0 THEN
                            chunk_result := units[hundreds + 1] || ' Hundred ';
                        END IF;
                        IF tens_units >= 20 THEN
                            chunk_result := chunk_result || tens[tens_units / 10 + 1] || ' ';
                            IF tens_units % 10 > 0 THEN
                                chunk_result := chunk_result || units[(tens_units % 10) + 1] || ' ';
                            END IF;
                        ELSIF tens_units >= 10 THEN
                            chunk_result := chunk_result || teens[tens_units - 9] || ' ';
                        ELSIF tens_units > 0 THEN
                            chunk_result := chunk_result || units[tens_units + 1] || ' ';
                        END IF;
                        result := trim(chunk_result) || thousands[chunk_index + 1] || ' ' || result;
                    END;
                END IF;
                num := num / 1000;
                chunk_index := chunk_index + 1;
            END LOOP;

            result := trim(result);
            RETURN upper(substring(result, 1, 1)) || lower(substring(result, 2)) || ' only';
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    `;

    const createTableQuery = `
    drop table if exists payslips;
        CREATE TABLE IF NOT EXISTS payslips (
            id SERIAL PRIMARY KEY,
            employee_name VARCHAR(50) NOT NULL,
            employee_id VARCHAR(7) NOT NULL CHECK (employee_id ~ '^[ATS]{3}0(?!000)[0-9]{3}$'),
            month DATE NOT NULL,
            password VARCHAR(30) NOT NULL CHECK (LENGTH(password) >= 8 AND LENGTH(password) <= 30),
            ctc DECIMAL(10,2) NOT NULL,
            basic_salary DECIMAL(10,2) NOT NULL,
            dearness_allowance DECIMAL(10,2) NOT NULL,
            house_rent_allowance DECIMAL(10,2) NOT NULL,
            wage_allowance DECIMAL(10,2) NOT NULL,
            medical_allowance DECIMAL(10,2) NOT NULL,
            provident_fund DECIMAL(10,2) NOT NULL,
            employee_state_insurance DECIMAL(10,2) NOT NULL,
            tax_deducted_at_source DECIMAL(10,2) NOT NULL,
            leave_without_pay DECIMAL(10,2) NOT NULL,
            special_deduction DECIMAL(10,2) NOT NULL,
            other_deduction DECIMAL(10,2) NOT NULL,
            net_pay DECIMAL(10,2) GENERATED ALWAYS AS (
                basic_salary + dearness_allowance + house_rent_allowance + 
                wage_allowance + medical_allowance - provident_fund - 
                employee_state_insurance - tax_deducted_at_source - 
                leave_without_pay - special_deduction - other_deduction
            ) STORED,
            net_pay_words TEXT GENERATED ALWAYS AS (
                CASE 
                    WHEN (basic_salary + dearness_allowance + house_rent_allowance + 
                          wage_allowance + medical_allowance - provident_fund - 
                          employee_state_insurance - tax_deducted_at_source - 
                          leave_without_pay - special_deduction - other_deduction) = 0 
                    THEN 'Zero only'
                    ELSE number_to_words(ROUND((
                        basic_salary + dearness_allowance + house_rent_allowance + 
                        wage_allowance + medical_allowance - provident_fund - 
                        employee_state_insurance - tax_deducted_at_source - 
                        leave_without_pay - special_deduction - other_deduction
                    ))::INTEGER)
                END
            ) STORED,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(createFunctionQuery);
        console.log('number_to_words function created or already exists.');
        await pool.query(createTableQuery);
        console.log('Payslips table created or already exists.');
    } catch (err) {
        console.error('Error creating table or function:', err.message, err.stack);
        throw err;
    }
}

// Initialize database and table
async function initialize() {
    await testDbConnection();
    await createTable();
}

initialize().catch(err => {
    console.error('Initialization failed:', err.message, err.stack);
    process.exit(1);
});

// API to handle payslip generation
app.post('/api/payslip', async (req, res) => {
    console.log('Received /api/payslip request:', req.body);
    const { 
        employeeName, 
        employeeID, 
        month, 
        employeePassword,
        ctc
    } = req.body;

    // Server-side validation
    const namePattern = /^[A-Za-z]+(?:\.[A-Za-z]+)*(?: [A-Za-z]+)*(?:\.[A-Za-z]+){0,3}$/;
    const idPattern = /^[ATS]{3}0(?!000)[0-9]{3}$/;

    // Validate month format and range
    let selectedYear, selectedMonth;
    try {
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            throw new Error('Month must be in YYYY-MM format.');
        }
        [selectedYear, selectedMonth] = month.split('-').map(Number);
        if (isNaN(selectedYear) || isNaN(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
            throw new Error('Invalid month format.');
        }
    } catch (err) {
        console.error('Month validation error:', err.message, { month });
        return res.status(400).json({ message: 'Invalid month selection.' });
    }

    const minYear = 2021;
    const minMonth = 1;
    const now = new Date();
    const maxYear = now.getFullYear();
    const maxMonth = now.getMonth(); // 0-based, April 2025 = 3

    console.log('Month validation:', { selectedYear, selectedMonth, maxYear, maxMonth });

    try {
        if (!employeeName || !namePattern.test(employeeName)) {
            return res.status(400).json({ message: 'Invalid employee name format.' });
        }
        if (!employeeID || !idPattern.test(employeeID)) {
            return res.status(400).json({ message: 'Invalid employee ID format. Must be like ATS0123.' });
        }
        if (
            selectedYear < minYear || 
            (selectedYear === minYear && selectedMonth < minMonth) ||
            selectedYear > maxYear ||
            (selectedYear === maxYear && selectedMonth > maxMonth)
        ) {
            console.warn('Month out of range:', { selectedYear, selectedMonth, minYear, maxMonth });
            return res.status(400).json({ message: 'Month must be between January 2021 and April 2025.' });
        }
        if (!employeePassword || employeePassword.length < 8 || employeePassword.length > 30) {
            return res.status(400).json({ message: 'Password must be between 8 and 30 characters.' });
        }
        if (!ctc || isNaN(ctc) || ctc < 100000 || ctc > 4000000 || (ctc % 5000 !== 0)) {
            return res.status(400).json({ message: 'CTC must be between 100,000 and 4,000,000 in steps of 5,000.' });
        }

        // Calculate salary components based on CTC (monthly)
        const monthlyCtc = ctc / 12;
        const basicSalary = parseFloat((monthlyCtc * 0.60).toFixed(2)); // 60% of monthly CTC
        const dearnessAllowance = parseFloat((monthlyCtc * 0.10).toFixed(2)); // 10%
        const houseRentAllowance = parseFloat((monthlyCtc * 0.15).toFixed(2)); // 15%
        const wageAllowance = parseFloat((monthlyCtc * 0.05).toFixed(2)); // 5%
        const medicalAllowance = parseFloat((monthlyCtc * 0.10).toFixed(2)); // 10%
        const grossSalary = basicSalary + dearnessAllowance + houseRentAllowance + wageAllowance + medicalAllowance;
        const providentFund = parseFloat((basicSalary * 0.12).toFixed(2)); // 12% of Basic
        const employeeStateInsurance = parseFloat((grossSalary * 0.0325).toFixed(2)); // 3.25% of gross
        const taxDeductedAtSource = 0.00; // No tax
        const leaveWithoutPay = 0.00; // Default
        const specialDeduction = parseFloat((monthlyCtc * 0.05).toFixed(2)); // 5%
        // Other deduction to ensure total deductions = 20% of monthly CTC
        const totalDeductionsTarget = parseFloat((monthlyCtc * 0.20).toFixed(2));
        const otherDeduction = parseFloat((totalDeductionsTarget - (providentFund + employeeStateInsurance + specialDeduction)).toFixed(2));

        const query = `
            INSERT INTO payslips (
                employee_name, 
                employee_id, 
                month, 
                password,
                ctc,
                basic_salary,
                dearness_allowance,
                house_rent_allowance,
                wage_allowance,
                medical_allowance,
                provident_fund,
                employee_state_insurance,
                tax_deducted_at_source,
                leave_without_pay,
                special_deduction,
                other_deduction
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *;
        `;
        const values = [
            employeeName, 
            employeeID, 
            `${month}-01`, 
            employeePassword,
            ctc,
            basicSalary,
            dearnessAllowance,
            houseRentAllowance,
            wageAllowance,
            medicalAllowance,
            providentFund,
            employeeStateInsurance,
            taxDeductedAtSource,
            leaveWithoutPay,
            specialDeduction,
            otherDeduction
        ];

        const result = await pool.query(query, values);
        const payslip = result.rows[0];

        // Convert DECIMAL fields to numbers
        const numericFields = [
            'ctc',
            'basic_salary',
            'dearness_allowance',
            'house_rent_allowance',
            'wage_allowance',
            'medical_allowance',
            'provident_fund',
            'employee_state_insurance',
            'tax_deducted_at_source',
            'leave_without_pay',
            'special_deduction',
            'other_deduction',
            'net_pay'
        ];
        numericFields.forEach(field => {
            payslip[field] = parseFloat(payslip[field]);
        });

        console.log('Payslip saved successfully:', payslip);
        res.status(201).json({ message: 'Payslip generated successfully', data: payslip });
    } catch (err) {
        console.error('Error saving payslip:', err.message, err.stack);
        res.status(500).json({ message: 'Server error while saving payslip.', error: err.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Server is running' });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
