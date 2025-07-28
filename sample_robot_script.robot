*** Settings ***
Library    SeleniumLibrary
Documentation    Form Submission Test with Validation

*** Variables ***
${NAME_FIELD_LOCATOR}    xpath://input[@name='username']
${SUBMIT_BUTTON_LOCATOR}    xpath://button[text()='Submit']
${NAME_VALUE}    Mohan Reddy
${SCREENSHOT_DIR}    ./screenshots
${TIMEOUT}    10s

*** Test Cases ***
Enter Name and Submit Form
    [Documentation]    Test entering name and submitting a form with validation
    
    # Setup
    Open Browser    about:blank    chrome
    Set Selenium Implicit Wait    5s
    Set Screenshot Directory    ${SCREENSHOT_DIR}
    
    # Navigate to page
    Go To    \${URL}    # Replace with actual URL
    
    # Test steps with validation
    Log    Step 1: Entering text "${NAME_VALUE}" into the Name field
    ${name_field_visible}=    Run Keyword And Return Status    
    ...    Wait Until Element Is Visible    ${NAME_FIELD_LOCATOR}    timeout=${TIMEOUT}
    
    Run Keyword If    ${name_field_visible}    
    ...    Input Name    
    ...    ELSE    
    ...    Log Failed Step    Name field not visible    

    Log    Step 2: Clicking Submit button
    ${submit_button_visible}=    Run Keyword And Return Status    
    ...    Wait Until Element Is Visible    ${SUBMIT_BUTTON_LOCATOR}    timeout=${TIMEOUT}
    
    Run Keyword If    ${submit_button_visible}    
    ...    Click Submit    
    ...    ELSE    
    ...    Log Failed Step    Submit button not visible
    
    # Cleanup
    Close Browser

*** Keywords ***
Input Name
    [Documentation]    Enter name with validation and screenshot
    
    ${input_success}=    Run Keyword And Return Status    
    ...    Input Text    ${NAME_FIELD_LOCATOR}    ${NAME_VALUE}
    
    # Take screenshot regardless of success or failure
    Capture Page Screenshot    name_field_{${input_success}}.png
    
    # Log result based on success/failure
    IF    ${input_success}
        Log    Successfully entered "${NAME_VALUE}" into the Name field
    ELSE
        Log    Failed to enter text into Name field
    END
    
    # Return the result for potential use in test flow
    [Return]    ${input_success}

Click Submit
    [Documentation]    Click submit button with validation and screenshot
    
    ${click_success}=    Run Keyword And Return Status    
    ...    Click Element    ${SUBMIT_BUTTON_LOCATOR}
    
    # Take screenshot regardless of success or failure
    Capture Page Screenshot    submit_button_{${click_success}}.png
    
    # Log result based on success/failure
    IF    ${click_success}
        Log    Successfully clicked the Submit button
    ELSE
        Log    Failed to click the Submit button
    END
    
    # Return the result for potential use in test flow
    [Return]    ${click_success}

Log Failed Step
    [Arguments]    ${message}
    
    Log    ERROR: ${message}
    Capture Page Screenshot    error_{${message}}.png 