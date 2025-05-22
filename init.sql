-- Create number_to_words function for net_pay_words
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

-- Create payslips table
CREATE TABLE payslips (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(50) NOT NULL,
    employee_id VARCHAR(7) NOT NULL CHECK (employee_id ~ '^[ATS]{3}0(?!000)[0-9]{3}$'),
    month DATE NOT NULL,
    password VARCHAR(30) NOT NULL CHECK (LENGTH(password) >= 8 AND LENGTH(password) <= 30),
    ctc DECIMAL(10,2) NOT NULL CHECK (ctc >= 100000 AND ctc <= 4000000 AND ctc % 5000 = 0),
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
