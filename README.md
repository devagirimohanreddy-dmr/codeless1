<<<<<<< HEAD
# codeless
=======
# Advanced XPath Tool with Robot Framework Test Builder

A powerful Chrome extension for web element inspection, XPath generation, and Robot Framework test script creation.

## Features

### XPath Inspection & Generation
- **Element Inspection**: Hover over elements to inspect their properties
- **Multiple XPath Strategies**: Generate various XPath patterns based on element attributes
- **Unique Identifiers**: Find the most reliable and unique selectors for any element
- **Interactive Testing**: Test XPath expressions against live web pages

### Robot Framework Test Builder
- **Action Recording**: Build test steps by selecting elements and actions
- **Multiple Locator Types**: Choose from XPath, ID, name, class, or CSS selectors
- **Supported Actions**:
  - Click Element
  - Input Text
  - Clear Element Text
  - Select From List
  - Wait For Element
  - Scroll Element Into View
  - Element Validation
- **Step Management**: Reorder, edit, or delete test steps
- **AI-Powered Test Generation**: Generate complete Robot Framework test scripts using Gemini AI
- **Script Download**: Save generated tests directly to your computer

## Installation

1. Clone this repository or download the ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

## Usage

### XPath Inspection
1. Click the extension icon to open the popup
2. Click "Start Inspection" to enable element selection
3. Hover over elements on the page to see their properties
4. Click on an element to lock the selection
5. Different XPath strategies will be generated and displayed

### Robot Framework Test Building
1. Use the XPath Inspector to select an element
2. In the "Robot Framework Test Builder" section, choose:
   - Locator Type (XPath, ID, name, etc.)
   - Action (click, input, etc.)
   - Input Value (for text input actions)
3. Click "Add Step" to add the action to your test
4. Repeat to build a sequence of test steps
5. Use the step controls to reorder or edit steps as needed
6. Click "Generate Robot Script" to create a complete test script
7. Review, edit, copy, or download the generated script

## AI Test Generation

This extension uses the Gemini 1.5 Flash API to generate professional Robot Framework test scripts. The default API key is included but can be replaced with your own.

The AI generation:
- Creates proper Robot Framework structure with headers
- Includes appropriate library imports
- Adds documentation and comments
- Includes setup and teardown procedures
- Implements best practices and error handling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
>>>>>>> dfa6b01 (Initial commit)
