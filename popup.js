// Initialize state
let isInspectorActive = false;
let isLocked = false;
let lastXPaths = null;
let testSteps = [];  // Array to store test steps
let currentLocator = "";
let currentLocatorType = "xpath";
let currentElementInfo = null; // Store the current element info
let geminiApiKey = "AIzaSyCGVJbnSHSvgiPbnv5dB1cWEbq2092EvEI"; // Default API key from MohanAI_Updated.py

// Pre-declare functions to make them available globally
// This prevents "is not defined" errors when functions are called before declaration
window.setupCopyButtons = null; // Will be assigned the actual function later
window.updateXPaths = null; // Will be assigned the actual function later

// XPath suggestions data
const xpathSuggestions = {
    functions: [
        {
            text: 'normalize-space(text())',
            description: 'Normalizes whitespace in text content',
            category: 'function'
        },
        {
            text: 'contains(text(), "")',
            description: 'Checks if text contains a substring',
            category: 'function'
        },
        {
            text: 'starts-with(text(), "")',
            description: 'Checks if text starts with a substring',
            category: 'function'
        }
    ],
    axes: [
        {
            text: 'following::',
            description: 'Selects elements that appear after the current node',
            category: 'axis'
        },
        {
            text: 'preceding::',
            description: 'Selects elements that appear before the current node',
            category: 'axis'
        },
        {
            text: 'ancestor::',
            description: 'Selects parent elements up the tree',
            category: 'axis'
        },
        {
            text: 'descendant::',
            description: 'Selects child elements down the tree',
            category: 'axis'
        }
    ],
    patterns: [
        {
            text: '//tagname[@attribute="value"]',
            description: 'Find element by attribute value',
            category: 'pattern'
        },
        {
            text: '//tagname[contains(@class, "value")]',
            description: 'Find element by partial class match',
            category: 'pattern'
        },
        {
            text: '//tagname[normalize-space(text())="value"]',
            description: 'Find element by exact text',
            category: 'pattern'
        }
    ],
    commonElements: [
        {
            text: '//button',
            description: 'Select all button elements',
            category: 'element'
        },
        {
            text: '//input',
            description: 'Select all input elements',
            category: 'element'
        },
        {
            text: '//a',
            description: 'Select all link elements',
            category: 'element'
        },
        {
            text: '//div',
            description: 'Select all div elements',
            category: 'element'
        }
    ]
};

// Robot Framework actions mapping
const robotActions = {
    'click': {
        name: 'Click Element',
        params: ['locator'],
        template: 'Click Element    ${locator}'
    },
    'input': {
        name: 'Input Text',
        params: ['locator', 'text'],
        template: 'Input Text    ${locator}    ${text}'
    },
    'clear': {
        name: 'Clear Element Text',
        params: ['locator'],
        template: 'Clear Element Text    ${locator}'
    },
    'select': {
        name: 'Select From List By Label',
        params: ['locator', 'label'],
        template: 'Select From List By Label    ${locator}    ${label}'
    },
    'wait': {
        name: 'Wait Until Element Is Visible',
        params: ['locator'],
        template: 'Wait Until Element Is Visible    ${locator}    timeout=10s'
    },
    'scroll': {
        name: 'Scroll Element Into View',
        params: ['locator'],
        template: 'Scroll Element Into View    ${locator}'
    },
    'validate': {
        name: 'Element Should Be Visible',
        params: ['locator'],
        template: 'Element Should Be Visible    ${locator}'
    }
};

// Basic function to update inspector status display safely
function safeUpdateStatus() {
    try {
        const toggleButton = document.getElementById('toggleInspector');
        const statusDiv = document.querySelector('.status-info');
        
        if (toggleButton) {
            toggleButton.textContent = isInspectorActive ? 'Stop Inspection' : 'Start Inspection';
            toggleButton.classList.toggle('active', isInspectorActive);
        }
        
        if (statusDiv) {
            if (isInspectorActive || isLocked) {
                statusDiv.innerHTML = `
                    <div class="status-text">
                        <p><strong>Status:</strong> ${isLocked ? 'Locked' : 'Active'}</p>
                        <p><strong>Shortcuts:</strong></p>
                        <ul>
                            <li>Hover for 1s - Auto-lock element</li>
                            <li>Any key - Unlock</li>
                            <li>Any click - Unlock</li>
                            <li><kbd>ESC</kbd> - Stop inspection</li>
                        </ul>
                    </div>
                `;
            } else {
                statusDiv.innerHTML = '';
            }
        }
    } catch (e) {
        console.error("Failed to update status:", e);
    }
}

// On document load, initialize the extension without dependencies
function initializeExtension() {
    try {
        console.log("Starting extension initialization");
        
        // Reset UI state
        const loadingElement = document.getElementById('scriptLoading');
        const errorElement = document.getElementById('scriptError');
        const modelInfoElement = document.getElementById('modelInfo');
        
        if (loadingElement) loadingElement.style.display = 'none';
        if (errorElement) errorElement.style.display = 'none';
        if (modelInfoElement) modelInfoElement.style.display = 'none';
        
        // Check for previously generated scripts first
        checkForGeneratedScripts();
        
        // Initialize API key
        chrome.storage.local.get(['geminiApiKey'], function(result) {
            if (result.geminiApiKey) {
                geminiApiKey = result.geminiApiKey;
                console.log('API key loaded from storage');
            }
        });
        
        // Restore state and setup listeners
        window.setTimeout(() => {
            try {
                // Initialize basic state using our safe function
                safeUpdateStatus();
                
                // Setup all event listeners
                setupEventListeners();
                
                console.log('Popup initialized successfully');
            } catch (e) {
                console.error("Error in delayed initialization:", e);
            }
        }, 100);
        
        // Initialize XPath inspector by sending message to content script
        try {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs && tabs[0] && tabs[0].id) {
                    console.log("Sending initial checkLockStatus message to content script");
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'checkLockStatus' }, function(response) {
                        try {
                            if (chrome.runtime.lastError) {
                                console.error("Error checking lock status:", chrome.runtime.lastError.message);
                                
                                // Always go straight to offline mode if we can't connect to content script
                                console.log("Content script connection failed, switching to offline mode");
                                
                                // Update UI to show we're in offline mode
                                const statusContainer = document.getElementById('statusContainer');
                                if (statusContainer) {
                                    statusContainer.innerHTML = 
                                        `<div class="status-message warning">
                                            <span>&#8987; Inspection not available. Using stored data only.</span>
                                        </div>`;
                                }
                                
                                // Disable inspection controls
                                if (toggleButton) {
                                    toggleButton.disabled = true;
                                    toggleButton.title = "Inspection not available - refresh the page to enable";
                                    toggleButton.classList.add('disabled');
                                }
                                
                                // Focus on script generation instead
                                const generateSection = document.getElementById('robotScriptSection');
                                if (generateSection) {
                                    generateSection.style.opacity = '1';
                                }
                                
                                // Try to restore any stored data
                                restorePreviousScripts(true);
                                
                                // Check directly for any previous scripts
                                checkForGeneratedScripts();
                            } else if (response) {
                                console.log("Got lock status response from content script:", response);
                                if (response.isLocked && response.xpaths) {
                                    lastXPaths = response.xpaths;
                                    isLocked = response.isLocked;
                                    if (response.elementInfo) {
                                        currentElementInfo = response.elementInfo;
                                    }
                                    
                                    // Update UI with XPath data
                                    if (typeof updateXPaths === 'function') {
                                        updateXPaths(response.xpaths);
                                    }
                                    if (typeof safeUpdateStatus === 'function') {
                                        safeUpdateStatus();
                                    }
                                }
                            }
                        } catch (err) {
                            console.error("Exception handling lock status response:", err);
                        }
                    });
                }
            });
        } catch (e) {
            console.error("Error initializing XPath inspector:", e);
        }
    } catch (error) {
        console.error("Extension initialization error:", error);
    }
}

function setupCopyAndDownload() {
    const copyButtons = document.querySelectorAll('#copyScriptButton');
    const downloadButtons = document.querySelectorAll('#downloadScriptButton');
    const possibleOutputs = [
        document.getElementById('robotScript'),
        document.getElementById('robotScriptResult'),
        document.getElementById('scriptOutput')
    ];

    function getScriptText() {
        for (const el of possibleOutputs) {
            if (!el) continue;
            if (el.tagName === 'TEXTAREA' && el.value?.trim()) return el.value;
            if (el.textContent?.trim()) return el.textContent.trim();
        }
        return '';
    }

    copyButtons.forEach(copyButton => {
        copyButton.addEventListener('click', () => {
            const scriptText = getScriptText();
            if (!scriptText) {
                alert("No script content available to copy.");
                return;
            }

            navigator.clipboard.writeText(scriptText).then(() => {
                copyButton.innerText = 'Copied!';
                setTimeout(() => {
                    copyButton.innerText = '📋 Copy Script';
                }, 1500);
            }).catch(err => {
                alert("Failed to copy: " + err);
            });
        });
    });

    downloadButtons.forEach(downloadButton => {
        downloadButton.addEventListener('click', () => {
            const scriptText = getScriptText();
            if (!scriptText) {
                alert("No script content available to download.");
                return;
            }

            const blob = new Blob([scriptText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'RecordedTest.robot';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });
}





// Setup all event listeners
function setupEventListeners() {
    // Set button text to emphasize gemini-1.5-flash-latest
    const generateButton = document.getElementById('generateScriptButton');
    if (generateButton) {
        const modelText = generateButton.querySelector('.button-model');
        if (modelText) {
            modelText.textContent = 'using gemini-1.5-flash-latest';
        }
        
        // Add click handler for script generation - use global function
        console.log("Setting up click handler for generate button");
        generateButton.addEventListener('click', function(e) {
            console.log("Generate button clicked");
            e.preventDefault();
            window.handleGenerateScriptClick();
        });
    } else {
        console.error("Generate button not found during event setup");
    }
    
    // Setup event delegation for copy buttons
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('copy-button')) {
            const value = e.target.getAttribute('data-value');
            if (value) {
                navigator.clipboard.writeText(value)
                    .then(() => {
                        const originalText = e.target.textContent;
                        e.target.textContent = 'Copied!';
                        setTimeout(() => {
                            e.target.textContent = originalText;
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                    });
            }
        }
    });
    
    // Save API key when provided
    const saveKeyButton = document.getElementById('saveGeminiApiKey');
    if (saveKeyButton) {
        saveKeyButton.addEventListener('click', function() {
            const apiKeyInput = document.getElementById('geminiApiKeyInput');
            if (!apiKeyInput) {
                console.error("API Key input not found");
                return;
            }
            
            const newApiKey = apiKeyInput.value.trim();
            
            if (!newApiKey) {
                alert('Please enter a valid API key for gemini-1.5-flash-latest');
                return;
            }
            
            // Save the API key in both local variable and storage for background worker to use
            geminiApiKey = newApiKey;
            chrome.storage.local.set({ geminiApiKey: newApiKey }, () => {
                console.log('API key saved for background processing');
            });
            
            // Hide the form
            document.getElementById('geminiApiKeyForm').style.display = 'none';
            
            // Show success message
            alert('API Key saved for gemini-1.5-flash-latest! This model requires special access from Google AI Studio.');
        });
    }
    
    // Load Previous Scripts button
    const loadPreviousScriptsButton = document.getElementById('loadPreviousScriptsButton');
    if (loadPreviousScriptsButton) {
        loadPreviousScriptsButton.addEventListener('click', () => {
            try {
                loadPreviousScripts();
            } catch (err) {
                console.error('Error loading previous scripts:', err);
                alert('Error loading previous scripts: ' + err.message);
            }
        });
    }
}

// Wrapper for safe Chrome API calls
function safeApiCall(apiFunction, fallback = null) {
    try {
        if (!isExtensionContextValid()) {
            console.error("Extension context invalid, can't perform API call");
            return fallback;
        }
        return apiFunction();
    } catch (e) {
        console.error("Chrome API call failed:", e);
        return fallback;
    }
}

// Set up a message listener for XPath data
try {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        try {
            if (request.action === 'updateXPaths' && request.xpaths) {
                console.log("Received XPaths from content script:", request);
                lastXPaths = request.xpaths;
                if (typeof updateXPaths === 'function') {
                    try {
                        updateXPaths(request.xpaths);
                    } catch (e) {
                        console.error("Error updating XPaths:", e);
                    }
                }
                if (request.elementInfo) {
                    currentElementInfo = request.elementInfo;
                }
                if (request.isLocked !== undefined) {
                    isLocked = request.isLocked;
                    if (typeof safeUpdateStatus === 'function') {
                        safeUpdateStatus();
                    }
                }
            }
        } catch (innerError) {
            console.error("Error handling message:", innerError);
        }
        return true;
    });
} catch (listenerError) {
    console.error("Failed to set up message listener:", listenerError);
}

// Function to safely create dates from potentially invalid timestamps
function safeCreateDate(timestamp) {
    // Handle specific problematic timestamps we've seen
    if (typeof timestamp === 'string') {
        // Check for known problematic timestamps and replace them
        if (timestamp.includes('2025-06-20T08:16:34-966Z')) {
            console.log("Caught specific problematic timestamp:", timestamp);
            return new Date('2025-06-20T08:16:34.000Z');
        }
    }
    
    // If no timestamp provided, return current date
    if (!timestamp) {
        return new Date();
    }
    
    // If it's already a Date object, check if it's valid
    if (timestamp instanceof Date) {
        return isNaN(timestamp.getTime()) ? new Date() : timestamp;
    }
    
    // If it's a number (timestamp in ms), create a date
    if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? new Date() : date;
    }
    
    // If it's a string, we need to sanitize it
    if (typeof timestamp === 'string') {
        // Special case - the T replaced with 0 pattern
        if (timestamp.match(/^\d{4}-\d{2}-\d{2}0\d{2}:/)) {
            timestamp = timestamp.replace(/(\d{4}-\d{2}-\d{2})0/, "$1T");
        }
        
        // Try to create a date
        try {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date;
            }
            
            // If it failed, try some common patterns
            // ISO-like but with wrong separators
            if (timestamp.includes('-') || timestamp.includes(':')) {
                // Try to extract parts
                let fixedTimestamp = timestamp;
                
                // Fix common issues with ISO format
                if (timestamp.includes('T')) {
                    const [datePart, timePart] = timestamp.split('T');
                    
                    // Fix date part - should use hyphens
                    const fixedDatePart = datePart.replace(/:/g, '-');
                    
                    // Fix time part - first 2 separators should be colons
                    let fixedTimePart = timePart;
                    if (timePart.match(/[\d.:-]+/)) {
                        const segments = timePart.split(/[.:-]/);
                        if (segments.length >= 3) {
                            fixedTimePart = `${segments[0]}:${segments[1]}:${segments[2]}`;
                            // Add ms if present
                            if (segments.length > 3) {
                                fixedTimePart += `.${segments[3]}`;
                            }
                            // Add Z if present
                            if (timePart.includes('Z')) {
                                fixedTimePart += 'Z';
                            }
                        }
                    }
                    
                    fixedTimestamp = `${fixedDatePart}T${fixedTimePart}`;
                }
                
                // Handle various malformed timezone offsets
                // Case 1: -XXXZ format (invalid timezone + Z)
                if (fixedTimestamp.match(/T\d{2}:\d{2}:\d{2}-\d{3,}Z/)) {
                    console.log("Found malformed timezone with Z:", fixedTimestamp);
                    // Replace invalid timezone with Z (UTC)
                    fixedTimestamp = fixedTimestamp.replace(/-\d{3,}Z/, 'Z');
                    console.log("Fixed timezone offset:", fixedTimestamp);
                }
                // Case 2: Any invalid timezone format
                else if (fixedTimestamp.match(/T\d{2}:\d{2}:\d{2}[-+]\d{3,}/)) {
                    console.log("Found invalid timezone format:", fixedTimestamp);
                    // Replace entire timezone with Z
                    fixedTimestamp = fixedTimestamp.replace(/[-+]\d{3,}/, 'Z');
                    console.log("Fixed timezone to UTC:", fixedTimestamp);
                }
                // Case 3: Missing timezone but has milliseconds
                else if (fixedTimestamp.match(/T\d{2}:\d{2}:\d{2}\.\d{3}$/)) {
                    console.log("Found timestamp missing timezone:", fixedTimestamp);
                    // Add Z for UTC
                    fixedTimestamp = fixedTimestamp + 'Z';
                    console.log("Added UTC timezone:", fixedTimestamp);
                }
                
                // Try again with fixed timestamp
                const fixedDate = new Date(fixedTimestamp);
                if (!isNaN(fixedDate.getTime())) {
                    return fixedDate;
                }
            }
        } catch (e) {
            console.warn("Error parsing date:", timestamp, e);
        }
    }
    
    // If all else fails, return current date
    return new Date();
}

// Function to format dates consistently and safely
function safeFormatDate(date, options = {}) {
    try {
        // Ensure we have a valid date
        const validDate = safeCreateDate(date);
        
        // Default formatting options
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        
        // Merge options
        const formattingOptions = { ...defaultOptions, ...options };
        
        // Format date
        return new Intl.DateTimeFormat('en-US', formattingOptions).format(validDate);
    } catch (e) {
        console.error("Error formatting date:", e);
        return "Unknown date";
    }
}

// Function to check if extension context is valid
function isExtensionContextValid() {
    try {
        // Try to perform a basic Chrome API operation
        chrome.runtime.getURL('');
        return true;
    } catch (e) {
        console.error("Extension context invalidated:", e);
        return false;
    }
}

// Run initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded, initializing extension");
    
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
        console.error("Extension context is invalid, showing error message");
        document.body.innerHTML = `
            <div class="error-container" style="padding: 20px; text-align: center; color: #d93025;">
                <h2>Extension Error</h2>
                <p>The extension context has been invalidated. Please try:</p>
                <ol style="text-align: left; display: inline-block;">
                    <li>Closing this popup</li>
                    <li>Refreshing the page</li>
                    <li>Opening the extension again</li>
                </ol>
                <p>If the problem persists, reload the extension from chrome://extensions</p>
            </div>
        `;
        return;
    }
    
    // Clean up any problematic timestamp keys in storage
    cleanupStoredTimestamps();
    
    // Setup notification close handler
    const persistenceNotice = document.getElementById('scriptPersistenceNotice');
    if (persistenceNotice) {
        const closeButton = persistenceNotice.querySelector('.close-notice');
        if (closeButton) {
            closeButton.addEventListener('click', function() {
                persistenceNotice.style.display = 'none';
                // Remember that user has closed the notice
                chrome.storage.local.set({ 'noticeClosedTimestamp': Date.now() });
            });
        }
        
        // Check if we should show the notice (not shown within last 24 hours)
        chrome.storage.local.get(['noticeClosedTimestamp'], function(result) {
            const lastClosed = result.noticeClosedTimestamp || 0;
            const now = Date.now();
            const hoursSinceClosed = (now - lastClosed) / (1000 * 60 * 60);
            
            if (hoursSinceClosed < 24) {
                persistenceNotice.style.display = 'none';
            }
        });
    }
    
    // Auto-highlight "Load Previous" button when scripts are available
    const loadPreviousButton = document.getElementById('loadPreviousScriptsButton');
    if (loadPreviousButton) {
        chrome.storage.local.get(null, function(result) {
            const scriptKeys = Object.keys(result).filter(key => 
                key === 'generatedScript' || 
                key === 'generatedScriptString' || 
                key.startsWith('generatedScript_')
            );
            
            if (scriptKeys.length > 0) {
                console.log(`Found ${scriptKeys.length} saved scripts, highlighting Load Previous button`);
                loadPreviousButton.classList.add('highlight-button');
                
                // Add a badge showing the number of scripts
                const badge = document.createElement('span');
                badge.className = 'script-count-badge';
                badge.textContent = scriptKeys.length;
                badge.style.position = 'absolute';
                badge.style.top = '-8px';
                badge.style.right = '-8px';
                badge.style.backgroundColor = '#d93025';
                badge.style.color = 'white';
                badge.style.borderRadius = '50%';
                badge.style.padding = '2px 6px';
                badge.style.fontSize = '11px';
                badge.style.fontWeight = 'bold';
                loadPreviousButton.appendChild(badge);
            }
        });
    }
    
    // Immediately check for any previously generated scripts
    checkForGeneratedScripts();
    
    // Immediately check if there's a locked element
    // Get the current state from storage
    chrome.storage.local.get(['lockedState'], function(result) {
        if (result.lockedState && result.lockedState.isLocked && result.lockedState.xpaths) {
            console.log("Found locked state with XPaths:", result.lockedState);
            lastXPaths = result.lockedState.xpaths;
            isLocked = true;
        }
        
        // Ensure we wait for all resources before initializing
        setTimeout(function() {
            try {
                initializeExtension();
                
                // Double-check button setup
                const generateButton = document.getElementById('generateScriptButton');
                if (generateButton && !generateButton._hasClickHandler) {
                    console.log("Adding click handler to generate button (delayed)");
                    generateButton.addEventListener('click', function(e) {
                        console.log("Generate button clicked (delayed handler)");
                        e.preventDefault();
                        window.handleGenerateScriptClick();
                    });
                    generateButton._hasClickHandler = true;
                }
                
                // Check with content script if there are any locked elements
                try {
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs && tabs[0] && tabs[0].id) {
                            chrome.tabs.sendMessage(tabs[0].id, { action: 'checkLockStatus' }, function(response) {
                                try {
                                    if (chrome.runtime.lastError) {
                                        console.error("Error checking lock status:", chrome.runtime.lastError.message);
                                    } else if (response) {
                                        console.log("Got lock status from content script:", response);
                                        if (response.isLocked && response.xpaths) {
                                            lastXPaths = response.xpaths;
                                            isLocked = response.isLocked;
                                            if (response.elementInfo) {
                                                currentElementInfo = response.elementInfo;
                                            }
                                            
                                            // Update UI with XPath data
                                            if (typeof updateXPaths === 'function') {
                                                updateXPaths(response.xpaths);
                                            }
                                            if (typeof safeUpdateStatus === 'function') {
                                                safeUpdateStatus();
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error("Exception handling lock status response:", err);
                                }
                            });
                        }
                    });
                } catch (e) {
                    console.error("Error checking lock status:", e);
                }
                
                console.log("Extension initialization complete");
            } catch (e) {
                console.error("Error during delayed initialization:", e);
            }
        }, 200); // Wait 200ms to ensure everything is ready
    });
});





let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
    setupCopyAndDownload();
    const recordButton = document.getElementById('recordToggleButton');
    const status = document.getElementById('recordingStatus');
    const stepList = document.getElementById('stepList');

    recordButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            const action = isRecording ? 'stopRecording' : 'startRecording';

            chrome.tabs.sendMessage(tabs[0].id, { action }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                if (response && response.success) {
                    isRecording = !isRecording;
                    recordButton.textContent = isRecording ? '🛑 Stop Recording' : '🎬 Start Recording';
                    status.textContent = isRecording ? '🔴 Recording...' : '✅ Not Recording';
                }
            });
        });
    });

    chrome.storage.local.get(['recordedSteps'], (result) => {
        const steps = result.recordedSteps || [];
        if (!steps.length) {
            stepList.innerHTML = '<p style="color: gray;">No steps recorded yet.</p>';
        } else {
            steps.forEach((step, index) => {
                const div = document.createElement('div');
                div.textContent = `${index + 1}. [${step.type}] ${step.xpath} ${step.value || ''}`;
                stepList.appendChild(div);
            });
        }
    });

});




// Check for scripts generated in the background - enhanced for reliability
function checkForGeneratedScripts() {
    console.log("Checking for previously generated scripts");
    
    // Find all script output elements
    const resultContainer = document.getElementById('robotScriptResult');
    const scriptOutput = document.getElementById('scriptOutput');
    const scriptStatusContainer = document.getElementById('scriptStatusContainer');
    const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
    
    if (!resultContainer && !scriptOutput) {
        console.error("Script output elements not found");
        return;
    }
    
    // Make container visible immediately to prevent flicker
    if (testScriptOutputContainer) {
        testScriptOutputContainer.style.display = 'block';
    }
    
    // Check for scripts in multiple storage locations for redundancy
    chrome.storage.local.get(null, (data) => {
        console.log("Checking storage for scripts, keys:", Object.keys(data).filter(k => 
            k === 'generatedScript' || 
            k === 'generatedScriptString' || 
            k.startsWith('generatedScript_')
        ));
        
        // Initialize variables for storing script data
        let scriptContent = null;
        let source = 'storage';
        let timestamp = new Date().toLocaleTimeString();
        let modelUsed = 'gemini-1.5-flash-latest';
        
        // First try the structured object format
        if (data.generatedScript) {
            console.log("Found stored script object");
            
            if (typeof data.generatedScript === 'object') {
                // Modern format with full metadata
                if (data.generatedScript.script && data.generatedScript.script.trim()) {
                    scriptContent = data.generatedScript.script;
                    
                    if (data.generatedScript.timestamp) {
                        timestamp = new Date(data.generatedScript.timestamp).toLocaleTimeString();
                    }
                    
                    if (data.generatedScript.modelUsed) {
                        modelUsed = data.generatedScript.modelUsed;
                    }
                    
                    if (data.generatedScript.allXPaths) {
                        lastXPaths = data.generatedScript.allXPaths;
                    }
                    
                    console.log(`Found script in structured format, length: ${scriptContent.length}, timestamp: ${timestamp}`);
                }
            } else if (typeof data.generatedScript === 'string' && data.generatedScript.trim()) {
                // Legacy format with just the string
                scriptContent = data.generatedScript;
                console.log(`Found script in legacy string format, length: ${scriptContent.length}`);
            }
        }
        
        // If no script found in main storage, try string backup
        if (!scriptContent && data.generatedScriptString && data.generatedScriptString.trim()) {
            scriptContent = data.generatedScriptString;
            source = 'backup';
            console.log(`Found script in backup string storage, length: ${scriptContent.length}`);
        }
        
        // If still no script, try timestamped backups and use the most recent one
        if (!scriptContent) {
            const backupKeys = Object.keys(data).filter(key => 
                key.startsWith('generatedScript_') && 
                typeof data[key] === 'string' && 
                data[key].trim()
            );
            
            if (backupKeys.length > 0) {
                // Sort keys by timestamp (newest first)
                backupKeys.sort().reverse();
                const mostRecentKey = backupKeys[0];
                
                scriptContent = data[mostRecentKey];
                source = 'timestamped backup';
                timestamp = mostRecentKey.replace('generatedScript_', '').replace(/-/g, ':');
                
                console.log(`Found script in timestamped backup (${mostRecentKey}), length: ${scriptContent.length}`);
            }
        }
        
        // If we found a script, display it
        if (scriptContent && scriptContent.trim()) {
            console.log("Displaying restored script in UI");
            
            // Use textarea if available, otherwise fallback to div
            if (resultContainer) {
                resultContainer.value = scriptContent;
                resultContainer.style.display = 'block';
            } else if (scriptOutput) {
                scriptOutput.textContent = scriptContent;
                scriptOutput.style.display = 'block';
            }
            
            // Show the script container
            if (testScriptOutputContainer) {
                testScriptOutputContainer.style.display = 'block';
            }
            
            // Update model info if available
            const modelInfoElement = document.getElementById('modelInfo');
            if (modelInfoElement) {
                modelInfoElement.textContent = `Script from ${modelUsed} (${timestamp})`;
                modelInfoElement.style.display = 'block';
            }
            
            // Show success message
            if (scriptStatusContainer) {
                scriptStatusContainer.innerHTML = 
                    `<div class="status-message success mini">
                        <span>&#10004; Script restored from ${source}</span>
                    </div>`;
            }
            
            // Hide loading spinner if visible
            const loadingElement = document.getElementById('scriptLoading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            // Make sure we have proper copy button setup
            try {
                safeExecute('setupCopyButtons');
            } catch (e) {
                console.error("Error setting up copy buttons:", e);
            }
            
            // Update XPaths if available
            if (lastXPaths) {
                try {
                    safeExecute('updateXPaths', lastXPaths);
                } catch (e) {
                    console.error("Error updating XPaths from stored script:", e);
                }
            }
            
            console.log("Script restoration complete");
            return true;
        } else {
            console.log("No previously generated scripts found in storage");
            return false;
        }
    });
}

// Poll for script generation status - make globally available
window.startScriptStatusPolling = function() {
    console.log("Starting script status polling");
    
    // Make sure result container is visible
    const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
    if (testScriptOutputContainer) {
        testScriptOutputContainer.style.display = 'block';
    }
    
    // Find the script output element
    const resultContainer = document.getElementById('robotScriptResult');
    const scriptOutput = document.getElementById('scriptOutput');
    const loadingElement = document.getElementById('scriptLoading');
    const scriptStatusContainer = document.getElementById('scriptStatusContainer');
    
    // Use the first available output element
    const outputElement = resultContainer || scriptOutput;
    
    if (!outputElement) {
        console.error("Script output element not found, cannot start polling");
        return;
    }
    
    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }
    
    window.updateScriptLoadingStatus("Waiting for script generation to complete...", 60);
    
    const pollInterval = 2000; // Poll every 2 seconds
    const statusInterval = setInterval(() => {
        chrome.runtime.sendMessage({action: 'checkScriptGenerationStatus'}, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error checking script status:", chrome.runtime.lastError);
                clearInterval(statusInterval);
                if (loadingElement) loadingElement.style.display = 'none';
                return;
            }
            
            if (response && response.status && response.status.completed) {
                console.log("Script generation completed:", response.status);
                // Script generation completed
                clearInterval(statusInterval);
                
                if (loadingElement) loadingElement.style.display = 'none';
                
                if (response.status.success === false) {
                    // Show error
                    outputElement.value = `Error generating script: ${response.status.error}`;
                    outputElement.style.display = 'block';
                    
                    // Update status with error
                    window.updateScriptLoadingStatus(`Error: ${response.status.error}`, 100);
                } else if (response.status.script) {
                    // Show the generated script
                    outputElement.value = response.status.script;
                    outputElement.style.display = 'block';
                    
                    // Update status with success
                    window.updateScriptLoadingStatus(`Script successfully generated using ${response.status.modelUsed}!`, 100);
                    
                    // Show minimized success message
                    if (scriptStatusContainer) {
                        const timestamp = new Date(response.status.timestamp).toLocaleTimeString();
                        scriptStatusContainer.innerHTML = 
                            `<div class="status-message success mini">
                                <span>&#10004; Script successfully generated using ${response.status.modelUsed}</span>
                            </div>`;
                    }
                }
            } else {
                // Still processing
                window.updateScriptLoadingStatus("Script generation in progress...", 70);
            }
        });
    }, pollInterval);
    
    // Store the interval ID to clear it if needed
    window.scriptPollIntervalId = statusInterval;
    
    console.log("Status polling interval set:", window.scriptPollIntervalId);
}

// Clear any polling when popup is closed
window.addEventListener('unload', () => {
    if (window.scriptPollIntervalId) {
        clearInterval(window.scriptPollIntervalId);
    }
});

// Save API key to storage for background script to use
async function saveApiKey(apiKey) {
    return new Promise((resolve) => {
        chrome.storage.local.set({'geminiApiKey': apiKey}, () => {
            resolve();
        });
    });
}

// Function to generate Robot Framework script via background worker
async function generateRobotScriptViaBackground(xpathDetails) {
    try {
        if (!geminiApiKey) {
            console.error("No API key found");
            const scriptOutput = document.getElementById('scriptOutput') || document.getElementById('robotScriptResult');
            if (scriptOutput) {
                scriptOutput.value = "Error: Please enter a valid Gemini API key.";
                scriptOutput.style.display = 'block';
            }
            return;
        }
        
        // Save API key for background service worker to use
        await saveApiKey(geminiApiKey);
        
        // Update UI to show processing
        const scriptOutput = document.getElementById('scriptOutput') || document.getElementById('robotScriptResult');
        const scriptStatusContainer = document.getElementById('scriptStatusContainer');
        
        if (scriptOutput) {
            scriptOutput.value = "Starting script generation in background. This will continue even if you close the popup...";
            scriptOutput.style.display = 'block';
        }
        
        if (scriptStatusContainer) {
            scriptStatusContainer.innerHTML = 
                `<div class="status-message processing">
                    <span> &#9203; Generating script in background...</span>
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                </div>`;
        }
        
        // Send message to background service worker
        chrome.runtime.sendMessage({
            action: 'generateRobotScript',
            data: xpathDetails
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error starting background generation:", chrome.runtime.lastError);
                
                if (scriptOutput) {
                    scriptOutput.value = `Error starting background generation: ${chrome.runtime.lastError.message}`;
                }
                return;
            }
            
            console.log("Background script generation started:", response);
            
            // Start polling for status
            startScriptStatusPolling();
        });
    } catch (error) {
        console.error("Error setting up background generation:", error);
        
        const scriptOutput = document.getElementById('scriptOutput') || document.getElementById('robotScriptResult');
        if (scriptOutput) {
            scriptOutput.value = `Error: ${error.message}`;
            scriptOutput.style.display = 'block';
        }
    }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    const toggleButton = document.getElementById('toggleInspector');
    const xpathInput = document.getElementById('xpathInput');
    const testButton = document.getElementById('testXPath');
    const resultsDiv = document.getElementById('xpathResults');
    const suggestionsDiv = document.getElementById('xpathSuggestions');
    
    // Robot Framework action builder elements
    const locatorTypeSelect = document.getElementById('locatorType');
    const actionTypeSelect = document.getElementById('actionType');
    const inputValueContainer = document.getElementById('inputValueContainer');
    const inputValueField = document.getElementById('inputValue');
    const addStepButton = document.getElementById('addStepButton');
    const clearCurrentButton = document.getElementById('clearCurrentButton');
    const stepsContainer = document.getElementById('stepsContainer');
    const emptyStepsMessage = document.getElementById('emptyStepsMessage');
    const generateScriptButton = document.getElementById('generateScriptButton');
    const clearAllStepsButton = document.getElementById('clearAllStepsButton');
    const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
    const scriptOutput = document.getElementById('scriptOutput');
    const copyScriptButton = document.getElementById('copyScriptButton');
    const downloadScriptButton = document.getElementById('downloadScriptButton');
    const editScriptButton = document.getElementById('editScriptButton');
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status-info';
    toggleButton.parentNode.insertBefore(statusDiv, toggleButton.nextSibling);
    
    const xpathSelectorContainer = document.getElementById('xpathSelectorContainer');
    const xpathSelector = document.getElementById('xpathSelector');
    
    // Load previously recorded steps and recording status
    chrome.storage.local.get(['isRecording', 'recordedSteps'], (res) => {
        const isRecording = res.isRecording;
        const steps = res.recordedSteps || [];

        const toggleButton = document.getElementById('recordToggleButton');
        const status = document.getElementById('recordingStatus');

        if (toggleButton && status) {
            toggleButton.textContent = isRecording ? '🛑 Stop Recording' : '🎬 Start Recording';
            status.textContent = isRecording ? '🔴 Recording...' : '✅ Not recording';
        }

        const stepList = document.getElementById('stepList'); // Make sure this div exists in popup.html
        if (stepList) {
            stepList.innerHTML = '';
            if (steps.length === 0) {
                stepList.innerHTML = '<p style="color: gray;">No steps recorded yet.</p>';
            } else {
                steps.forEach((step, i) => {
                    const div = document.createElement('div');
                    div.textContent = `${i + 1}. [${step.type}] ${step.xpath || ''} ${step.value || ''}`;
                    div.style.marginBottom = '4px';
                    stepList.appendChild(div);
                });
            }
        }
    });





    // Setup XPath suggestions
    xpathInput.addEventListener('input', (event) => {
        const value = event.target.value.toLowerCase();
        if (!value) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.classList.remove('show');
            return;
        }

        // Combine all suggestions
        const allSuggestions = [
            ...xpathSuggestions.functions,
            ...xpathSuggestions.axes,
            ...xpathSuggestions.patterns,
            ...xpathSuggestions.commonElements
        ];

        // Filter suggestions based on input
        const filteredSuggestions = allSuggestions.filter(suggestion =>
            suggestion.text.toLowerCase().includes(value) ||
            suggestion.description.toLowerCase().includes(value)
        ).slice(0, 5); // Limit to 5 suggestions

        if (filteredSuggestions.length > 0) {
            suggestionsDiv.innerHTML = filteredSuggestions
                .map(suggestion => `
                    <div class="suggestion-item" data-value="${suggestion.text}">
                        <div class="suggestion-content">
                            <div class="suggestion-text">${suggestion.text}</div>
                            <div class="suggestion-description">${suggestion.description}</div>
                        </div>
                        <span class="suggestion-category">${suggestion.category}</span>
                    </div>
                `)
                .join('');
            suggestionsDiv.classList.add('show');
        } else {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.classList.remove('show');
        }
    });

    // Handle suggestion clicks
    suggestionsDiv.addEventListener('click', (event) => {
        const suggestionItem = event.target.closest('.suggestion-item');
        if (suggestionItem) {
            const value = suggestionItem.dataset.value;
            xpathInput.value = value;
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.classList.remove('show');
            xpathInput.focus();
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.input-wrapper')) {
            suggestionsDiv.classList.remove('show');
        }
    });

    // Handle keyboard navigation
    xpathInput.addEventListener('keydown', (event) => {
        const suggestions = suggestionsDiv.querySelectorAll('.suggestion-item');
        const currentIndex = Array.from(suggestions).findIndex(item => item.classList.contains('selected'));

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (currentIndex < suggestions.length - 1) {
                    if (currentIndex >= 0) suggestions[currentIndex].classList.remove('selected');
                    suggestions[currentIndex + 1].classList.add('selected');
                }
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (currentIndex > 0) {
                    suggestions[currentIndex].classList.remove('selected');
                    suggestions[currentIndex - 1].classList.add('selected');
                }
                break;
            case 'Enter':
                if (currentIndex >= 0) {
                    event.preventDefault();
                    const selectedValue = suggestions[currentIndex].dataset.value;
                    xpathInput.value = selectedValue;
                    suggestionsDiv.innerHTML = '';
                    suggestionsDiv.classList.remove('show');
                }
                break;
            case 'Escape':
                suggestionsDiv.classList.remove('show');
                break;
        }
    });

    // Handle action type changes
    actionTypeSelect.addEventListener('change', () => {
        const actionType = actionTypeSelect.value;
        
        // Show/hide input value field based on action type
        if (actionType === 'input' || actionType === 'select') {
            inputValueContainer.style.display = 'block';
        } else {
            inputValueContainer.style.display = 'none';
        }
    });
    
    // Trigger the initial action type change event to set proper visibility
    actionTypeSelect.dispatchEvent(new Event('change'));

    // Handle locator type changes
    locatorTypeSelect.addEventListener('change', () => {
        const locatorType = locatorTypeSelect.value;
        
        // Show/hide xpath selector based on locator type
        if (locatorType === 'xpath') {
            xpathSelectorContainer.style.display = 'block';
        } else {
            xpathSelectorContainer.style.display = 'none';
        }
        
        // Show/hide input value field based on action type
        const actionType = actionTypeSelect.value;
        if (actionType === 'input' || actionType === 'select') {
            inputValueContainer.style.display = 'block';
        } else {
            inputValueContainer.style.display = 'none';
        }
    });
    
    // Handle XPath selector changes
    xpathSelector.addEventListener('change', () => {
        if (xpathSelector.value) {
            currentLocator = xpathSelector.value;
        }
    });
    
    // Trigger the initial locator type change event to set proper visibility
    locatorTypeSelect.dispatchEvent(new Event('change'));

    // Add step to test script
    addStepButton.addEventListener('click', () => {
        try {
            const elementName = document.getElementById('elementName').value.trim() || 'Element';
            const locatorType = locatorTypeSelect.value;
            const actionType = actionTypeSelect.value;
            const inputValue = inputValueField.value;
            
            // Failsafe: Generate a basic XPath if no locator is available
            if (!currentLocator && currentElementInfo) {
                console.log("No current locator found, generating a basic one from element info");
                if (currentElementInfo.tagName) {
                    if (currentElementInfo.id) {
                        currentLocator = `//${currentElementInfo.tagName}[@id="${currentElementInfo.id}"]`;
                    } else if (currentElementInfo.className) {
                        const firstClass = currentElementInfo.className.split(' ')[0];
                        currentLocator = `//${currentElementInfo.tagName}[contains(@class, "${firstClass}")]`;
                    } else if (currentElementInfo.name) {
                        currentLocator = `//${currentElementInfo.tagName}[@name="${currentElementInfo.name}"]`;
                    } else {
                        // Very basic XPath using the element's raw XPath if available
                        currentLocator = currentElementInfo.xpath || `//${currentElementInfo.tagName}`;
                    }
                    console.log("Generated fallback XPath:", currentLocator);
                }
            }
            
            // For actions that require input value, validate that it's provided
            if ((actionType === 'input' || actionType === 'select') && !inputValue.trim()) {
                alert(`Please enter a value for the ${actionType === 'input' ? 'text input' : 'selection'}.`);
                return;
            }
            
            // For Xpath locator type, validate that an xpath is selected from dropdown if available
            if (locatorType === 'xpath' && window.allAvailableXPaths && window.allAvailableXPaths.length > 0) {
                if (!currentLocator) {
                    alert("Please select an XPath from the dropdown.");
                    return;
                }
            } else if (!currentElementInfo) {
                alert("Please select an element first by using the inspector.");
                return;
            }
            
            // Create a formatted locator string based on the type
            let formattedLocator;
            switch(locatorType) {
                case 'xpath':
                    formattedLocator = currentLocator || '';
                    break;
                case 'id':
                    formattedLocator = `id=${currentElementInfo?.id || ''}`;
                    if (!currentElementInfo?.id) {
                        alert("Selected element doesn't have an ID. Please choose another locator type.");
                        return;
                    }
                    break;
                case 'name':
                    formattedLocator = `name=${currentElementInfo?.name || ''}`;
                    if (!currentElementInfo?.name) {
                        alert("Selected element doesn't have a name attribute. Please choose another locator type.");
                        return;
                    }
                    break;
                case 'class':
                    formattedLocator = `class=${currentElementInfo?.className || ''}`;
                    if (!currentElementInfo?.className) {
                        alert("Selected element doesn't have a class. Please choose another locator type.");
                        return;
                    }
                    break;
                case 'css':
                    // Attempt to create a simple CSS selector
                    const tagName = currentElementInfo?.tagName || 'div';
                    const id = currentElementInfo?.id ? `#${currentElementInfo.id}` : '';
                    const className = currentElementInfo?.className ? `.${currentElementInfo.className.split(' ')[0]}` : '';
                    formattedLocator = `css=${tagName}${id || className}`;
                    break;
                default:
                    formattedLocator = currentLocator || '';
            }
            
            // Final check that we have a valid locator
            if (!formattedLocator.trim()) {
                alert("Unable to create a valid locator. Please select an element first or choose a different locator type.");
                return;
            }
            
            // Create step object
            const step = {
                id: Date.now(),
                elementName,
                actionType,
                locatorType,
                locator: formattedLocator,
                value: inputValue,
                elementInfo: currentElementInfo ? JSON.parse(JSON.stringify(currentElementInfo)) : null
            };
            
            testSteps.push(step);
            renderSteps();
            
            // Clear input value field
            inputValueField.value = '';
            document.getElementById('elementName').value = '';
            
            // Show success message
            const successMessage = document.createElement('div');
            successMessage.className = 'success-message';
            successMessage.textContent = 'Step added successfully!';
            addStepButton.parentNode.appendChild(successMessage);
            
            // Remove the message after a few seconds
            setTimeout(() => {
                if (successMessage.parentNode) {
                    successMessage.parentNode.removeChild(successMessage);
                }
            }, 3000);
        } catch (error) {
            console.error("Error adding step:", error);
            alert("An error occurred while adding the step. Please try again.");
        }
    });
    
    // Clear current selections
    clearCurrentButton.addEventListener('click', () => {
        inputValueField.value = '';
    });
    
    // Clear all steps
    clearAllStepsButton.addEventListener('click', () => {
        if (testSteps.length === 0) return;
        
        if (confirm("Are you sure you want to clear all steps?")) {
            testSteps = [];
            renderSteps();
            testScriptOutputContainer.style.display = 'none';
        }
    });
    
    // Clear storage button
    document.getElementById('clearStorageButton').addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all saved data? This will remove all saved steps, XPaths, and settings.')) {
            chrome.storage.local.clear(function() {
                console.log('Storage cleared');
                
                // Reset state
                testSteps = [];
                currentXPaths = null;
                currentElementInfo = null;
                
                // Update UI
                renderSteps();
                document.getElementById('elementInfo').innerHTML = '';
                
                // Clear XPath containers
                const xpathContainers = [
                    'uniqueXPathsContainer',
                    'specializedXPathsContainer',
                    'formXPathsContainer',
                    'classBasedContainer',
                    'roleBasedContainer',
                    'textValueContainer',
                    'classRoleTextContainer',
                    'classRoleValueContainer',
                    'classRoleIndexContainer',
                    'classTextValueContainer',
                    'parentRoleContainer',
                    'roleAttributeContainer',
                    'multipleRolesContainer',
                    'parentContextContainer',
                    'verticalRelativeContainer',
                    'horizontalRelativeContainer',
                    'nearRelativeContainer'
                ];
                
                xpathContainers.forEach(containerId => {
                    const container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="xpath-placeholder">No XPaths found</div>';
                    }
                });
                
                // Hide script output and related elements
                document.getElementById('robotScriptResult').style.display = 'none';
                document.getElementById('scriptOutput').style.display = 'none';
                document.getElementById('modelInfo').style.display = 'none';
                document.getElementById('testScriptOutputContainer').style.display = 'none';
                document.getElementById('scriptError').style.display = 'none';
                
                alert('All saved data has been cleared');
            });
        }
    });
    
    // Generate Robot Framework script button will be handled by handleGenerateScriptClick
    
    // Save API key when provided
    document.getElementById('saveGeminiApiKey').addEventListener('click', function() {
        const apiKeyInput = document.getElementById('geminiApiKeyInput');
        const newApiKey = apiKeyInput.value.trim();
        
        if (!newApiKey) {
            alert('Please enter a valid API key for gemini-1.5-flash-latest');
            return;
        }
        
        // Save the API key in both local variable and storage for background worker to use
        geminiApiKey = newApiKey;
        chrome.storage.local.set({ geminiApiKey: newApiKey }, () => {
            console.log('API key saved for background processing');
        });
        
        // Hide the form
        document.getElementById('geminiApiKeyForm').style.display = 'none';
        
        // Show success message
        alert('API Key saved for gemini-1.5-flash-latest! This model requires special access from Google AI Studio.');
    });
    
    // Initialize API key from storage
    function initializeApiKey() {
        chrome.storage.local.get(['geminiApiKey'], function(result) {
            if (result.geminiApiKey) {
                geminiApiKey = result.geminiApiKey;
                console.log('API key loaded from storage');
            }
        });
    }
    
    // Restore generated script if available with robust error handling
    function restoreGeneratedScript() {
        console.log("Attempting to restore generated script from storage");
        
        // Try multiple storage keys for better resilience
        chrome.storage.local.get(['generatedScript', 'generatedScriptString', 'modelUsed', 'lastXPaths'], function(result) {
            console.log("Storage retrieval result keys:", Object.keys(result));
            
            // First priority: check for script in the structured storage
            if (result.generatedScript) {
                const resultContainer = document.getElementById('robotScriptResult');
                const scriptOutput = document.getElementById('scriptOutput');
                const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
                
                if (!resultContainer && !scriptOutput) {
                    console.error("Script output containers not found");
                    return;
                }
                
                let scriptContent = '';
                let modelUsed = 'gemini-1.5-flash-latest';
                let storedXPaths = null;
                let sourceElement = null;
                
                // Extract script content based on format
                if (typeof result.generatedScript === 'object') {
                    console.log("Found generatedScript as object:", Object.keys(result.generatedScript));
                    
                    if (result.generatedScript.script) {
                        scriptContent = result.generatedScript.script;
                        console.log("Found script in object format, length:", scriptContent.length);
                    }
                    
                    if (result.generatedScript.modelUsed) {
                        modelUsed = result.generatedScript.modelUsed;
                    }
                    
                    if (result.generatedScript.source) {
                        sourceElement = result.generatedScript.source;
                        console.log("Script was saved from:", sourceElement);
                    }
                    
                    // Extract XPaths if available
                    if (result.generatedScript.allXPaths) {
                        storedXPaths = result.generatedScript.allXPaths;
                        console.log("Found XPaths in script object");
                    } else if (result.generatedScript.xpathDetails?.allXPaths) {
                        storedXPaths = result.generatedScript.xpathDetails.allXPaths;
                        console.log("Found XPaths in xpathDetails");
                    }
                } else if (typeof result.generatedScript === 'string') {
                    // Old format with just string
                    scriptContent = result.generatedScript;
                    console.log("Found script in string format, length:", scriptContent.length);
                    
                    // Use modelUsed from separate storage if available
                    if (result.modelUsed) {
                        modelUsed = result.modelUsed;
                    }
                }
                
                // Fallback to the string version if needed
                if ((!scriptContent || !scriptContent.trim()) && result.generatedScriptString) {
                    scriptContent = result.generatedScriptString;
                    console.log("Using fallback generatedScriptString, length:", scriptContent.length);
                }
                
                // Only proceed if we actually have script content
                if (scriptContent && scriptContent.trim()) {
                    console.log("Script content found, attempting to display in UI");
                    
                    // Try to use textarea first, then div as fallback
                    if (resultContainer) {
                        resultContainer.value = scriptContent;
                        resultContainer.style.display = 'block';
                        console.log("Script set in textarea element");
                    } else if (scriptOutput) {
                        scriptOutput.textContent = scriptContent;
                        scriptOutput.style.display = 'block';
                        console.log("Script set in div element");
                    }
                    
                    // Show the containers
                    if (testScriptOutputContainer) {
                        testScriptOutputContainer.style.display = 'block';
                        console.log("Script container made visible");
                    }
                    
                    // Show model info
                    const modelInfoElement = document.getElementById('modelInfo');
                    if (modelInfoElement) {
                        modelInfoElement.textContent = `Generated using ${modelUsed} model`;
                        modelInfoElement.style.display = 'block';
                    }
                    
                    // Show success message
                    const scriptStatusContainer = document.getElementById('scriptStatusContainer');
                    if (scriptStatusContainer) {
                        scriptStatusContainer.innerHTML = 
                            `<div class="status-message success mini">
                                <span>✅ Script restored from previous session</span>
                            </div>`;
                    }
                    
                    // Hide loading spinner
                    const loadingElement = document.getElementById('scriptLoading');
                    if (loadingElement) {
                        loadingElement.style.display = 'none';
                    }
                    
                    console.log('Successfully restored script from storage');
                } else {
                    console.warn('Found generatedScript in storage but content was empty');
                    
                    // Try to scan storage for any backup scripts with timestamps
                    chrome.storage.local.get(null, function(allStorage) {
                        const backupKeys = Object.keys(allStorage).filter(key => 
                            key.startsWith('generatedScript_') && typeof allStorage[key] === 'string'
                        );
                        
                        if (backupKeys.length > 0) {
                            console.log(`Found ${backupKeys.length} backup scripts, using most recent`);
                            
                            // Sort by timestamp (descending) and use the most recent
                            backupKeys.sort().reverse();
                            const mostRecentKey = backupKeys[0];
                            const backupContent = allStorage[mostRecentKey];
                            
                            if (backupContent && backupContent.trim()) {
                                console.log(`Restoring from backup: ${mostRecentKey}, length: ${backupContent.length}`);
                                
                                // Set the content in the UI
                                if (resultContainer) {
                                    resultContainer.value = backupContent;
                                    resultContainer.style.display = 'block';
                                } else if (scriptOutput) {
                                    scriptOutput.textContent = backupContent;
                                    scriptOutput.style.display = 'block';
                                }
                                
                                // Show the container
                                if (testScriptOutputContainer) {
                                    testScriptOutputContainer.style.display = 'block';
                                }
                                
                                // Show success message
                                if (scriptStatusContainer) {
                                    scriptStatusContainer.innerHTML = 
                                        `<div class="status-message success mini">
                                            <span>✅ Script restored from backup</span>
                                        </div>`;
                                }
                                
                                // Hide loading spinner
                                if (loadingElement) {
                                    loadingElement.style.display = 'none';
                                }
                                
                                console.log('Successfully restored script from backup');
                                
                                // Save to main storage for future use
                                saveGeneratedScript(backupContent);
                            }
                        } else {
                            console.log("No backup scripts found in storage");
                        }
                    });
                }
                
                // Restore XPaths if available
                if (storedXPaths) {
                    console.log("Restoring XPaths from storage:", storedXPaths);
                    lastXPaths = storedXPaths;
                    try {
                        updateXPaths(storedXPaths);
                    } catch (e) {
                        console.error("Error updating XPaths from stored script:", e);
                    }
                } else if (result.lastXPaths) {
                    console.log("Restoring XPaths from separate storage:", result.lastXPaths);
                    lastXPaths = result.lastXPaths;
                    try {
                        updateXPaths(result.lastXPaths);
                    } catch (e) {
                        console.error("Error updating XPaths from separate storage:", e);
                    }
                }
                
                // Setup copy and download buttons
                setupCopyButtons();
            } else {
                console.log("No previously generated script found in generatedScript");
                
                // Check if we have the string version instead
                if (result.generatedScriptString) {
                    console.log("Found script in generatedScriptString, length:", result.generatedScriptString.length);
                    
                    // Save to the structured format for next time
                    saveGeneratedScript(result.generatedScriptString);
                    
                    // Force a recursive call to restore from the newly saved structured format
                    setTimeout(() => {
                        console.log("Recursively calling restoreGeneratedScript after saving string version");
                        restoreGeneratedScript();
                    }, 100);
                } else {
                    // Try to scan storage for any backup scripts with timestamps
                    chrome.storage.local.get(null, function(allStorage) {
                        const backupKeys = Object.keys(allStorage).filter(key => 
                            key.startsWith('generatedScript_') && typeof allStorage[key] === 'string'
                        );
                        
                        if (backupKeys.length > 0) {
                            console.log(`Found ${backupKeys.length} backup scripts, using most recent`);
                            
                            // Sort by timestamp (descending) and use the most recent
                            backupKeys.sort().reverse();
                            const mostRecentKey = backupKeys[0];
                            const backupContent = allStorage[mostRecentKey];
                            
                            if (backupContent && backupContent.trim()) {
                                console.log(`Restoring from backup: ${mostRecentKey}, length: ${backupContent.length}`);
                                
                                // Save to main storage then recursively call restore
                                saveGeneratedScript(backupContent);
                                setTimeout(() => {
                                    console.log("Recursively calling restoreGeneratedScript after saving backup");
                                    restoreGeneratedScript();
                                }, 100);
                            }
                        } else {
                            console.log("No scripts found in any storage location");
                        }
                    });
                }
            }
        });
    }

    // Copy generated script - robust implementation to prevent null values
    copyScriptButton.addEventListener('click', () => {
        try {
            // Look for the script in either the textarea or div element
            const resultContainer = document.getElementById('robotScriptResult');
            const scriptOutput = document.getElementById('scriptOutput');
            
            // Log the elements and their content for debugging
            console.log("Copy button clicked, elements found:", {
                resultContainer: resultContainer ? "Found" : "Not found",
                scriptOutput: scriptOutput ? "Found" : "Not found",
                resultContainerValue: resultContainer ? (resultContainer.value ? "Has value" : "Empty") : "N/A",
                scriptOutputContent: scriptOutput ? (scriptOutput.textContent ? "Has content" : "Empty") : "N/A"
            });
            
            let script = '';
            
            // First try the textarea (preferred)
            if (resultContainer && resultContainer.value && resultContainer.value.trim()) {
                script = resultContainer.value;
                console.log("Using robotScriptResult textarea value, length:", script.length);
            } 
            // Then try the div 
            else if (scriptOutput && scriptOutput.textContent && scriptOutput.textContent.trim()) {
                script = scriptOutput.textContent;
                console.log("Using scriptOutput div textContent, length:", script.length);
            }
            // If nothing is found in the UI, try to get from storage
            else {
                console.log("No visible script element found, trying storage");
                chrome.storage.local.get(['generatedScript'], function(result) {
                    let scriptContent = '';
                    console.log("Storage result:", result);
                    
                    if (result.generatedScript) {
                        if (typeof result.generatedScript === 'object' && result.generatedScript.script) {
                            scriptContent = result.generatedScript.script;
                            console.log("Found script in storage object, length:", scriptContent.length);
                        } else if (typeof result.generatedScript === 'string') {
                            scriptContent = result.generatedScript;
                            console.log("Found script in storage string, length:", scriptContent.length);
                        }
                        
                        if (scriptContent && scriptContent.trim()) {
                            console.log("Retrieved script from storage:", scriptContent.substring(0, 50) + "...");
                            performCopy(scriptContent);
                        } else {
                            console.error('Storage script content is empty or whitespace only');
                            alert('No script content found to copy');
                        }
                    } else {
                        console.error('No script found in storage');
                        alert('No script content found to copy');
                    }
                });
                return; // Exit early since we're using the async storage retrieval
            }
            
            if (!script || !script.trim()) {
                console.error('No script content found to copy or content is empty');
                alert('No script content found to copy');
                return;
            }
            
            performCopy(script);
        } catch (err) {
            console.error('Error during copy operation:', err);
            alert('Error copying: ' + err.message);
        }
        
        // Inner function to perform the actual copy
        function performCopy(content) {
            if (!content || typeof content !== 'string' || !content.trim()) {
                console.error("Invalid content provided to copy function:", content);
                alert('Cannot copy: Invalid content');
                return;
            }
            
            console.log("Copying content:", content.substring(0, 50) + "...");
            navigator.clipboard.writeText(content)
                .then(() => {
                    const originalText = copyScriptButton.textContent;
                    copyScriptButton.textContent = 'Copied!';
                    setTimeout(() => {
                        copyScriptButton.textContent = originalText;
                    }, 2000);
                    
                    // Show a small notification toast
                    const toast = document.createElement('div');
                    toast.className = 'copy-toast';
                    toast.textContent = 'Script copied to clipboard!';
                    document.body.appendChild(toast);
                    setTimeout(() => {
                        toast.classList.add('show');
                        setTimeout(() => {
                            toast.classList.remove('show');
                            setTimeout(() => document.body.removeChild(toast), 300);
                        }, 1500);
                    }, 10);
                })
                .catch(err => {
                    console.error('Could not copy text: ', err);
                    alert('Failed to copy: ' + err.message);
                });
        }
    });
    
    // Download script button - robust implementation to prevent null values
    downloadScriptButton.addEventListener('click', () => {
        try {
            // Look for the script in either the textarea or div element
            const resultContainer = document.getElementById('robotScriptResult');
            const scriptOutput = document.getElementById('scriptOutput');
            
            let script = '';
            
            // First try the textarea (preferred)
            if (resultContainer && resultContainer.value) {
                script = resultContainer.value;
                console.log("Using robotScriptResult textarea value for download");
            } 
            // Then try the div 
            else if (scriptOutput && scriptOutput.textContent) {
                script = scriptOutput.textContent;
                console.log("Using scriptOutput div textContent for download");
            }
            // If nothing is found in the UI, try to get from storage
            else {
                console.log("No visible script element found, trying storage for download");
                chrome.storage.local.get(['generatedScript'], function(result) {
                    let scriptContent = '';
                    if (result.generatedScript) {
                        if (typeof result.generatedScript === 'object' && result.generatedScript.script) {
                            scriptContent = result.generatedScript.script;
                        } else if (typeof result.generatedScript === 'string') {
                            scriptContent = result.generatedScript;
                        }
                        
                        if (scriptContent) {
                            console.log("Retrieved script from storage for download:", scriptContent.substring(0, 50) + "...");
                            performDownload(scriptContent);
                        } else {
                            console.error('Storage script content is empty');
                            alert('No script content found to download');
                        }
                    } else {
                        console.error('No script found in storage');
                        alert('No script content found to download');
                    }
                });
                return; // Exit early since we're using the async storage retrieval
            }
            
            if (!script) {
                console.error('No script content found to download');
                alert('No script content found to download');
                return;
            }
            
            performDownload(script);
        } catch (err) {
            console.error('Error during download operation:', err);
            alert('Error downloading: ' + err.message);
        }
        
        // Inner function to perform the actual download
        function performDownload(content) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `robot_test_${timestamp}.robot`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Show a small notification toast
            const toast = document.createElement('div');
            toast.className = 'download-toast';
            toast.textContent = 'Script downloaded successfully!';
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => document.body.removeChild(toast), 300);
                }, 1500);
            }, 10);
        }
    });
    
    // Edit script button - improved with better handling of Done state
    editScriptButton.addEventListener('click', () => {
        try {
            const resultContainer = document.getElementById('robotScriptResult');
            const scriptOutput = document.getElementById('scriptOutput');
            
            // Find which element is visible and being used - prioritize the textarea
            let activeElement = null;
            
            if (resultContainer && resultContainer.style.display !== 'none') {
                activeElement = resultContainer;
                console.log("Edit button: Using textarea element");
            } else if (scriptOutput && scriptOutput.style.display !== 'none') {
                activeElement = scriptOutput;
                console.log("Edit button: Using div element");
            }
            
            if (!activeElement) {
                console.error('No script element found to edit');
                alert('No script content found to edit');
                return;
            }
            
            // Determine if we're switching to edit mode or back to view mode
            const isCurrentlyEditable = activeElement.tagName === 'TEXTAREA' ? 
                                      !activeElement.readOnly : 
                                      activeElement.getAttribute('contenteditable') === 'true';
            
            console.log("Current editable state:", isCurrentlyEditable);
            console.log("Switching to:", !isCurrentlyEditable);
            
            // Toggle the editable state
            if (activeElement.tagName === 'TEXTAREA') {
                activeElement.readOnly = isCurrentlyEditable; // If editable, make read-only; if read-only, make editable
            } else {
                activeElement.setAttribute('contenteditable', !isCurrentlyEditable);
            }
            
            // Update visual state
            activeElement.classList.toggle('editable', !isCurrentlyEditable);
            editScriptButton.textContent = !isCurrentlyEditable ? 'Done' : 'Edit';
            
            // Save changes when toggling from edit to view mode
            if (isCurrentlyEditable) { // We were in edit mode and now switching to view mode
                console.log("Saving edited content");
                const content = activeElement.tagName === 'TEXTAREA' ? activeElement.value : activeElement.textContent;
                saveGeneratedScript(content);
                
                // Show a small toast confirmation
                const toast = document.createElement('div');
                toast.className = 'edit-toast';
                toast.textContent = 'Changes saved!';
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.classList.add('show');
                    setTimeout(() => {
                        toast.classList.remove('show');
                        setTimeout(() => document.body.removeChild(toast), 300);
                    }, 1500);
                }, 10);
            }
        } catch (err) {
            console.error('Error during edit operation:', err);
            alert('Error editing script: ' + err.message);
        }
    });
    
    // Clear generated script button
    const clearScriptButton = document.getElementById('clearScriptButton');
    if (clearScriptButton) {
        clearScriptButton.addEventListener('click', () => {
            try {
                console.log("Clearing generated script");
                
                // Hide all script containers
                const resultContainer = document.getElementById('robotScriptResult');
                const scriptOutput = document.getElementById('scriptOutput');
                const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
                const scriptStatusContainer = document.getElementById('scriptStatusContainer');
                const modelInfoElement = document.getElementById('modelInfo');
                
                // Clear script content
                if (resultContainer) {
                    resultContainer.value = '';
                    resultContainer.style.display = 'none';
                }
                
                if (scriptOutput) {
                    scriptOutput.textContent = '';
                    scriptOutput.style.display = 'none';
                }
                
                if (testScriptOutputContainer) {
                    testScriptOutputContainer.style.display = 'none';
                }
                
                if (scriptStatusContainer) {
                    scriptStatusContainer.innerHTML = '';
                }
                
                if (modelInfoElement) {
                    modelInfoElement.style.display = 'none';
                }
                
                // Clear from storage
                chrome.storage.local.remove(['generatedScript'], function() {
                    console.log('Cleared script from storage');
                    
                    // Show a small notification toast
                    const toast = document.createElement('div');
                    toast.className = 'clear-toast';
                    toast.textContent = 'Script cleared!';
                    document.body.appendChild(toast);
                    setTimeout(() => {
                        toast.classList.add('show');
                        setTimeout(() => {
                            toast.classList.remove('show');
                            setTimeout(() => document.body.removeChild(toast), 300);
                        }, 1500);
                    }, 10);
                });
            } catch (err) {
                console.error('Error clearing script:', err);
                alert('Error clearing script: ' + err.message);
            }
        });
    }
    
    // We already set up the clear script button above
    if (clearScriptButton) {
        clearScriptButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the generated script?')) {
                // Clear the script
                const resultContainer = document.getElementById('robotScriptResult');
                const scriptOutput = document.getElementById('scriptOutput');
                
                if (resultContainer) resultContainer.value = '';
                if (scriptOutput) scriptOutput.textContent = '';
                
                // Update storage to remove the script
                chrome.storage.local.remove('generatedScript', function() {
                    console.log('Generated script cleared from storage');
                });
                
                // Hide the script container
                const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
                if (testScriptOutputContainer) {
                    testScriptOutputContainer.style.display = 'none';
                }
            }
        });
    }

    // Setup XPath testing
    testButton.addEventListener('click', async () => {
        const xpath = xpathInput.value.trim();
        if (!xpath) {
            resultsDiv.innerHTML = '<div class="error">Please enter an XPath expression</div>';
            resultsDiv.classList.add('show');
            return;
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Clear any existing highlights first
            await chrome.tabs.sendMessage(tab.id, { action: 'clearHighlights' });
            
            // Test the XPath
            const result = await chrome.tabs.sendMessage(tab.id, {
                action: 'testXPath',
                xpath: xpath
            });
            
            if (result.success) {
                const matchCount = result.count;
                const plural = matchCount !== 1;
                
                if (matchCount > 0) {
                    resultsDiv.innerHTML = `
                        <div class="success">
                            <div class="match-info">
                                <span class="count">${matchCount} target element${plural ? 's' : ''}</span> found!
                                ${result.totalMatches > matchCount ? 
                                    `<div class="nested-info">(${result.totalMatches - matchCount} nested elements filtered out)</div>` 
                                    : ''}
                                <div class="highlight-info">
                                    Target element${plural ? 's are' : ' is'} highlighted in <span style="color: #ff4444">red</span>
                                </div>
                            </div>
                            ${result.xpath !== result.originalXPath ? `
                                <div class="xpath-debug">
                                    <div>Successful XPath:</div>
                                    <code>${result.xpath}</code>
                                    <div class="note">Note: Only the most specific matching elements are highlighted</div>
                                </div>
                            ` : ''}
                            <div class="interaction-help">
                                <ul>
                                    <li>Hover over elements to highlight them</li>
                                    <li>Click an element to scroll to it</li>
                                </ul>
                            </div>
                        </div>
                    `;

                    // If only one element is found, automatically scroll it into view
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'scrollToElement',
                        index: 0
                    });
                } else {
                    resultsDiv.innerHTML = `
                        <div class="warning">
                            No elements found matching this XPath
                            <div class="xpath-debug">
                                <div>Tried XPath:</div>
                                <code>${result.xpath}</code>
                                <div class="xpath-tips">
                                    Tips:
                                    <ul>
                                        <li>Check for hidden spaces in the text</li>
                                        <li>Try using normalize-space()</li>
                                        <li>Text might be in a child element</li>
                                        <li>Check case sensitivity</li>
                                        <li>Try a less specific XPath first</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    `;
                }
            } else {
                resultsDiv.innerHTML = `
                    <div class="error">
                        <div>Error evaluating XPath:</div>
                        <div class="error-details">${result.error}</div>
                        <div class="xpath-debug">
                            XPath: <code>${result.xpath}</code>
                        </div>
                    </div>
                `;
            }
            resultsDiv.classList.add('show');
        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="error">
                    <div>Error: Could not evaluate XPath</div>
                    <div class="error-details">${error.message || 'Unknown error'}</div>
                </div>
            `;
            resultsDiv.classList.add('show');
        }
    });

    // Handle Enter key in input
    xpathInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            testButton.click();
        }
    });

    // Clear highlights when popup closes
    window.addEventListener('unload', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { action: 'clearHighlights' });
        } catch (error) {
            console.log('Error clearing highlights:', error);
        }
    });

    // Try to restore test steps state on startup
    function restoreState() {
        console.log("Restoring extension state...");
        
        // Use Promise to ensure state is fully restored
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'robotFrameworkSteps', 
                'geminiApiKey', 
                'currentLocator',
                'currentLocatorType',
                'currentElementInfo',
                'lockedState'
            ], function(data) {
                console.log("Restored data:", data);
                
                // Restore test steps
                if (data.robotFrameworkSteps) {
                    try {
                        testSteps = JSON.parse(data.robotFrameworkSteps);
                        console.log("Restored test steps:", testSteps.length);
                    } catch (e) {
                        console.error("Error parsing stored test steps:", e);
                        testSteps = [];
                    }
                }
                
                // Restore API key
                if (data.geminiApiKey) {
                    geminiApiKey = data.geminiApiKey;
                    console.log("Restored API key");
                }
                
                // Restore current element info and locator
                if (data.currentLocator) {
                    currentLocator = data.currentLocator;
                    console.log("Restored current locator:", currentLocator);
                }
                
                if (data.currentLocatorType) {
                    currentLocatorType = data.currentLocatorType;
                    if (locatorTypeSelect) {
                        locatorTypeSelect.value = currentLocatorType;
                    }
                    console.log("Restored locator type:", currentLocatorType);
                }
                
                if (data.currentElementInfo) {
                    try {
                        currentElementInfo = JSON.parse(data.currentElementInfo);
                        console.log("Restored element info:", currentElementInfo);
                    } catch (e) {
                        console.error("Error parsing stored element info:", e);
                    }
                }
                
                // Restore locked state if available
                if (data.lockedState && data.lockedState.xpaths) {
                    isLocked = data.lockedState.isLocked || false;
                    lastXPaths = data.lockedState.xpaths;
                    
                    // Update XPaths display
                    try {
                        updateXPaths(lastXPaths);
                    } catch (e) {
                        console.error("Error updating XPaths from saved state:", e);
                    }
    }
    
    updateStatus();
                
                // Render steps after state is restored
                try {
                    renderSteps();
                } catch (e) {
                    console.error("Error rendering steps:", e);
                }
                
                // Update UI based on locator type
                if (locatorTypeSelect) {
                    locatorTypeSelect.dispatchEvent(new Event('change'));
                }
                
                resolve();
            });
        });
    }
    
    // Initialize the UI by restoring state
    try {
        await restoreState();
    } catch (error) {
        console.error("Error during state restoration:", error);
    }
    
    // Setup toggle button
    toggleButton.addEventListener('click', async () => {
        try {
            isInspectorActive = !isInspectorActive;
            updateStatus();
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
                toggleButton.disabled = true;
                toggleButton.textContent = 'Not available on this page';
                return;
            }
            
            // Inject content script if needed
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (err) {
                console.log('Content script already injected');
            }
            
            // Send toggle message
            await chrome.tabs.sendMessage(tab.id, {
                action: 'toggleInspector',
                isActive: isInspectorActive
            });
            
            // If inspector is active, request current element data
            if (isInspectorActive) {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'getLockedElement'
                });
            }
            
        } catch (error) {
            console.error('Error:', error);
            toggleButton.textContent = 'Error - Please refresh page';
            toggleButton.disabled = true;
        }
    });

    // Functions for managing steps
    function renderSteps() {
        if (testSteps.length === 0) {
            emptyStepsMessage.style.display = 'block';
            stepsContainer.querySelectorAll('.step-item').forEach(step => step.remove());
    } else {
            emptyStepsMessage.style.display = 'none';
            
            // Clear existing steps first
            stepsContainer.querySelectorAll('.step-item').forEach(step => step.remove());
            
            // Render each step
            testSteps.forEach((step, index) => {
                const stepElement = document.createElement('div');
                stepElement.className = 'step-item';
                stepElement.dataset.stepId = step.id;
                
                // Get action display name
                const actionInfo = robotActions[step.actionType];
                const actionName = actionInfo ? actionInfo.name : 'Unknown Action';
                
                // Create step content
                const stepContent = document.createElement('div');
                stepContent.className = 'step-content';
                
                // Title (step number, element name, and action)
                const title = document.createElement('div');
                title.className = 'step-title';
                title.textContent = `Step ${index + 1}: ${actionName} "${step.elementName}"`;
                
                // Details (locator and value if applicable)
                const details = document.createElement('div');
                details.className = 'step-details';
                
                const locator = document.createElement('div');
                locator.className = 'step-locator';
                locator.textContent = `${step.locatorType}: ${step.locator}`;
                
                details.appendChild(locator);
                
                // Add value if it exists
                if (step.value) {
                    const value = document.createElement('div');
                    value.textContent = `Value: ${step.value}`;
                    details.appendChild(value);
                }
                
                stepContent.appendChild(title);
                stepContent.appendChild(details);
                stepElement.appendChild(stepContent);
                
                // Step action buttons
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'step-buttons-container';
                
                // Move up button
                if (index > 0) {
                    const moveUpButton = document.createElement('button');
                    moveUpButton.className = 'step-button move-step';
                    moveUpButton.innerHTML = '&#8593;'; // Up arrow
                    moveUpButton.title = 'Move Up';
                    moveUpButton.addEventListener('click', () => moveStep(index, index - 1));
                    buttonContainer.appendChild(moveUpButton);
                }
                
                // Move down button
                if (index < testSteps.length - 1) {
                    const moveDownButton = document.createElement('button');
                    moveDownButton.className = 'step-button move-step';
                    moveDownButton.innerHTML = '&#8595;'; // Down arrow
                    moveDownButton.title = 'Move Down';
                    moveDownButton.addEventListener('click', () => moveStep(index, index + 1));
                    buttonContainer.appendChild(moveDownButton);
                }
                
                // Edit button
                const editButton = document.createElement('button');
                editButton.className = 'step-button edit-step';
                editButton.innerHTML = '&#9998;'; // Edit icon
                editButton.title = 'Edit Step';
                editButton.addEventListener('click', () => editStep(step.id));
                buttonContainer.appendChild(editButton);
                
                // Delete button
                const deleteButton = document.createElement('button');
                deleteButton.className = 'step-button delete-step';
                deleteButton.innerHTML = '&times;'; // X icon
                deleteButton.title = 'Delete Step';
                deleteButton.addEventListener('click', () => deleteStep(step.id));
                buttonContainer.appendChild(deleteButton);
                
                stepElement.appendChild(buttonContainer);
                stepsContainer.appendChild(stepElement);
            });
        }
        
        // Save state after rendering
        saveCurrentState();
    }
    
    function moveStep(fromIndex, toIndex) {
        const step = testSteps.splice(fromIndex, 1)[0];
        testSteps.splice(toIndex, 0, step);
        renderSteps();
    }
    
    function deleteStep(id) {
        testSteps = testSteps.filter(step => step.id !== id);
        renderSteps();
    }
    
    function editStep(id) {
        const step = testSteps.find(s => s.id === id);
        if (!step) return;
        
        // Populate form fields with step data
        document.getElementById('elementName').value = step.elementName || '';
        locatorTypeSelect.value = step.locatorType;
        currentLocator = step.locator;
        actionTypeSelect.value = step.actionType;
        actionTypeSelect.dispatchEvent(new Event('change')); // Update display
        
        if (step.value) {
            inputValueField.value = step.value;
        }
        
        // Remove the step from the list
        testSteps = testSteps.filter(s => s.id !== id);
        renderSteps();
    }

    // Use the global updateScriptLoadingStatus function declared earlier
    
    // Gemini-powered Robot Framework script generation
    async function generateRobotScript(steps) {
        if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY") {
            throw new Error("API key for gemini-1.5-flash-latest not configured");
        }
        
        if (!steps || steps.length === 0) {
            throw new Error("No test steps to generate a script from");
        }
        
        // Update status to show progress
        window.updateScriptLoadingStatus("Analyzing test steps for Robot Framework...", 15);
        await new Promise(resolve => setTimeout(resolve, 800)); // Small delay for UI update
        
        try {
            // Create structured prompt for Gemini
            window.updateScriptLoadingStatus("Creating structured prompt for gemini-1.5-flash-latest...", 30);
            const prompt = createGeminiPrompt(steps);
            console.log("Generated prompt:", prompt);
            await new Promise(resolve => setTimeout(resolve, 800)); // Small delay for UI update
            
            // Log what specific steps are being converted
            const stepTypes = steps.map(s => s.actionType);
            console.log(`Generating Robot Framework script for ${steps.length} steps. Action types: ${JSON.stringify(stepTypes)}`);
            
            window.updateScriptLoadingStatus(`Sending request to gemini-1.5-flash-latest API for ${steps.length} test steps...`, 50);
            console.log("Generating Robot Framework script using gemini-1.5-flash-latest model");
            
            const response = await callGeminiAPI(prompt);
            
            if (!response || !response.script || typeof response.script !== 'string' || response.script.trim() === '') {
                throw new Error("Invalid response from gemini-1.5-flash-latest API");
            }
            
            // Clean up any remaining code fences that might be in the response
            let cleanedScript = response.script;
            if (cleanedScript.includes("```")) {
                console.log("Cleaning up code fence markers in the response");
                cleanedScript = cleanedScript.replace(/```(?:robotframework)?([\s\S]*?)```/g, "$1").trim();
            }
            
            window.updateScriptLoadingStatus("Post-processing Robot Framework script...", 90);
            await new Promise(resolve => setTimeout(resolve, 800)); // Small delay for UI update
            
            // Validate the generated script has required Robot Framework components
            const rfComponents = [
                { name: "Settings section", regex: /\*+\s*Settings\s*\*+/, required: true },
                { name: "Variables section", regex: /\*+\s*Variables\s*\*+/, required: false },
                { name: "Test Cases section", regex: /\*+\s*Test Cases\s*\*+/, required: true },
                { name: "Keywords section", regex: /\*+\s*Keywords\s*\*+/, required: false },
                { name: "SeleniumLibrary", regex: /SeleniumLibrary/, required: true }
            ];
            
            const missingComponents = rfComponents
                .filter(comp => comp.required && !comp.regex.test(cleanedScript))
                .map(comp => comp.name);
            
            if (missingComponents.length > 0) {
                console.warn("Generated script is missing required Robot Framework components:", missingComponents.join(", "));
                // Continue anyway, as the script might still be usable
            }
            
            // Set to complete before returning
            window.updateScriptLoadingStatus("Robot Framework script generation complete!", 100);
            
            return {
                script: cleanedScript,
                modelUsed: "gemini-1.5-flash-latest"
            };
        } catch (error) {
            console.error("gemini-1.5-flash-latest API error:", error);
            window.updateScriptLoadingStatus(`Error with gemini-1.5-flash-latest: ${error.message}`, 100);
            
            // Handle specific error cases for gemini-1.5-flash-latest model
            if (error.message && error.message.includes("NOT_FOUND")) {
                throw new Error("The gemini-1.5-flash-latest model is not available with your API key. This model requires special access permissions in Google AI Studio.");
            } else if (error.message && error.message.includes("PERMISSION_DENIED")) {
                throw new Error("Permission denied for gemini-1.5-flash-latest model. Your API key may not have access to this model. Please check your Google AI Studio settings.");
            } else if (error.message && error.message.includes("INVALID_ARGUMENT")) {
                throw new Error("Invalid request format. Check that your prompt doesn't contain invalid characters or exceed token limits.");
            } else if (error.message && error.message.includes("RESOURCE_EXHAUSTED")) {
                throw new Error("Resource quota exceeded for gemini-1.5-flash-latest. You may need to wait or upgrade your API quota.");
            } else {
                throw new Error(`Failed to generate script with gemini-1.5-flash-latest: ${error.message}`);
            }
        }
    }
    
    function createGeminiPrompt(steps) {
        // Create a structured description of all steps
        const stepsDescription = steps.map((step, index) => {
            const actionInfo = robotActions[step.actionType];
            const actionName = actionInfo ? actionInfo.name : step.actionType;
            
            let description = `Step ${index + 1}: ${actionName} on element "${step.elementName}" with ${step.locatorType} = ${step.locator}`;
            
            if (step.value) {
                description += ` with value "${step.value}"`;
            }
            
            // Add element info if available
            if (step.elementInfo) {
                const info = step.elementInfo;
                description += `\nElement details: tag=${info.tagName}`;
                if (info.id) description += `, id=${info.id}`;
                if (info.className) description += `, class=${info.className}`;
                if (info.type) description += `, type=${info.type}`;
                if (info.name) description += `, name=${info.name}`;
                if (info.placeholder) description += `, placeholder=${info.placeholder}`;
                if (info.text) description += `, text=${info.text}`;
            }
            
            return description;
        }).join("\n\n");
        
        // Create a much simpler prompt that focuses on practical test script
        return `Generate a concise Robot Framework test script for the following steps:

${stepsDescription}

IMPORTANT REQUIREMENTS:
1. Create a SIMPLE script that follows standard Robot Framework practices
2. Put all XPath locators in the Variables section as \${ELEMENT_NAME_LOCATOR} = xpath://path
3. The test case should directly use these variables without complex logic
4. Include only these sections: Settings, Variables, Test Cases, Keywords (if needed)
5. For Settings, include only: Library SeleniumLibrary and Documentation
6. Format your output as a plain Robot Framework script (no markdown code blocks)
7. DO NOT use complex templating or FOR loops in the test structure
8. DO NOT use dictionaries or complex data structures - keep it simple
9. Each step should map to 1-2 simple Robot keywords like Click Element or Input Text
10. Variable names should be UPPERCASE with underscores
11. Include basic Open Browser and Close Browser in the test case

Example format (follow this structure):

*** Settings ***
Library    SeleniumLibrary
Documentation    Test generated by Advanced XPath Tool

*** Variables ***
\${URL}    https://example.com
\${ELEMENT1_LOCATOR}    xpath://div[@id='element1']
\${ELEMENT2_LOCATOR}    xpath://button[contains(text(),'Submit')]

*** Test Cases ***
Simple Navigation Test
    Open Browser    \${URL}    chrome
    Wait Until Element Is Visible    \${ELEMENT1_LOCATOR}
    Click Element    \${ELEMENT1_LOCATOR}
    Input Text    \${ELEMENT2_LOCATOR}    test value
    Close Browser

Output ONLY the Robot Framework script with no other explanation.`;
    }
    
    async function callGeminiAPI(prompt) {
        // Use the same model as in MohanAI
        const modelName = "gemini-1.5-flash-latest";
        
        // Use the updated API URL format from the Python SDK
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        
        // Format content as simple text (single prompt) just like MohanAI does for standard generation
        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2
            }
        };
        
        try {
            console.log(`Calling ${modelName} API with updated endpoint...`);
            window.updateScriptLoadingStatus(`Connecting to ${modelName} (beta endpoint)...`, 60);
            
            // Log the actual request being sent
            console.log("Request payload:", JSON.stringify(requestBody));
            
            const response = await fetch(`${API_URL}?key=${geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`${modelName} API error response:`, errorText);
                window.updateScriptLoadingStatus(`Error from ${modelName} API`, 100);
                throw new Error(`${modelName} API error: ${response.status} ${errorText}`);
            }
            
            window.updateScriptLoadingStatus(`Processing response from ${modelName}...`, 75);
            const data = await response.json();
            console.log(`${modelName} API response:`, data);
            
            // Extract the response text using the same approach as MohanAI
            if (data.candidates && data.candidates.length > 0 && 
                data.candidates[0].content && 
                data.candidates[0].content.parts && 
                data.candidates[0].content.parts.length > 0) {
                
                // Get the raw text from the response
                let generatedText = data.candidates[0].content.parts[0].text;
                
                // Clean up the response similar to MohanAI implementation
                // Remove markdown code fences if present
                generatedText = generatedText.trim();
                if (generatedText.startsWith("```") && generatedText.endsWith("```")) {
                    generatedText = generatedText.split('\n').slice(1, -1).join('\n');
                } else if (generatedText.startsWith("```robotframework") && generatedText.endsWith("```")) {
                    generatedText = generatedText.split('\n').slice(1, -1).join('\n');
                }
                
                window.updateScriptLoadingStatus(`Successfully generated script with ${modelName}`, 85);
                return {
                    script: generatedText.trim(),
                    modelUsed: modelName
                };
            }
            
            window.updateScriptLoadingStatus(`Invalid response format from ${modelName}`, 100);
            throw new Error(`Invalid response format from ${modelName} API`);
        } catch (error) {
            console.error(`${modelName} API call failed:`, error);
            window.updateScriptLoadingStatus(`Error: ${error.message}`, 100);
            throw error;
        }
    }
    
    // Helper function to create an XPath item
    function createXPathItem(xpath, type) {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'selector-item';
        
        // Create copy container
        const copyContainer = document.createElement('div');
        copyContainer.className = 'copy-container';
        
        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        
        // Ensure the xpath is a string (handle object case)
        let xpathStr = '';
        if (typeof xpath === 'string') {
            xpathStr = xpath;
        } else if (xpath && typeof xpath === 'object' && xpath.xpath) {
            xpathStr = xpath.xpath;
        } else if (xpath && typeof xpath.toString === 'function') {
            xpathStr = xpath.toString();
        }
        
        input.value = xpathStr;
        input.readOnly = true;
        input.setAttribute('title', xpathStr);
        copyContainer.appendChild(input);
        
        // Create copy button
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-button';
                    copyButton.textContent = 'Copy';
        copyButton.setAttribute('data-value', xpathStr);
        copyContainer.appendChild(copyButton);
        
        itemContainer.appendChild(copyContainer);
        
        return itemContainer;
    }

    // Setup copy buttons for XPaths
function setupCopyButtons() {
    console.log("Setting up copy buttons...");
    
    // Re-assign this function to the global variable for cross-reference
    window.setupCopyButtons = setupCopyButtons;
        
        // Standard copy buttons
        document.querySelectorAll('.copy-button').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                try {
                    const value = this.getAttribute('data-value');
                    console.log("Copy button clicked with value:", value ? value.substring(0, 30) + "..." : "null");
                    
                    if (!value) {
                        console.error("No value found on copy button");
                        return;
                    }
                    
                    // Use modern clipboard API
                    navigator.clipboard.writeText(value)
                        .then(() => {
                            console.log("Successfully copied to clipboard");
                            const originalText = this.textContent;
                            this.textContent = 'Copied!';
                            setTimeout(() => {
                                this.textContent = originalText;
                            }, 1500);
                        })
                        .catch(err => {
                            console.error('Failed to copy: ', err);
                            // Fallback method
                            fallbackCopy(value);
                        });
                } catch (err) {
                    console.error('Error in copy button handler:', err);
                    alert('Copy failed: ' + err.message);
                }
            });
        });
        
        // Script copy button (treated separately)
        const copyScriptButton = document.getElementById('copyScriptButton');
        if (copyScriptButton) {
            console.log("Found script copy button, setting up...");
            
            // Remove any existing listeners to prevent duplication
            const newCopyButton = copyScriptButton.cloneNode(true);
            copyScriptButton.parentNode.replaceChild(newCopyButton, copyScriptButton);
            
            newCopyButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log("Script copy button clicked");
                
                try {
                    // First try to get content from the textarea
                    const resultContainer = document.getElementById('robotScriptResult');
                    const scriptOutput = document.getElementById('scriptOutput');
                    
                    console.log("Looking for script content in UI elements:", {
                        resultContainer: resultContainer ? "Found" : "Not found",
                        scriptOutput: scriptOutput ? "Found" : "Not found",
                        resultContainerVisible: resultContainer ? (resultContainer.style.display !== 'none') : "N/A",
                        scriptOutputVisible: scriptOutput ? (scriptOutput.style.display !== 'none') : "N/A"
                    });
                    
                    let scriptContent = null;
                    
                    // First check the textarea
                    if (resultContainer && resultContainer.style.display !== 'none' && resultContainer.value && resultContainer.value.trim()) {
                        scriptContent = resultContainer.value.trim();
                        console.log("Found script in textarea, length:", scriptContent.length);
                    } 
                    // Then check the div
                    else if (scriptOutput && scriptOutput.style.display !== 'none' && scriptOutput.textContent && scriptOutput.textContent.trim()) {
                        scriptContent = scriptOutput.textContent.trim();
                        console.log("Found script in div, length:", scriptContent.length);
                    }
                    // If nothing visible, check storage
                    else {
                        console.log("No visible script content, checking storage");
                        
                        chrome.storage.local.get(['generatedScript', 'generatedScriptString'], function(result) {
                            console.log("Storage retrieval result keys:", Object.keys(result));
                            
                            let storedContent = null;
                            
                            // Check structured storage first
                            if (result.generatedScript) {
                                if (typeof result.generatedScript === 'object' && result.generatedScript.script) {
                                    storedContent = result.generatedScript.script.trim();
                                    console.log("Found script in structured storage, length:", storedContent.length);
                                } else if (typeof result.generatedScript === 'string') {
                                    storedContent = result.generatedScript.trim();
                                    console.log("Found script string in structured storage, length:", storedContent.length);
                                }
                            }
                            
                            // Check string storage as fallback
                            if (!storedContent && result.generatedScriptString) {
                                storedContent = result.generatedScriptString.trim();
                                console.log("Found script in string storage, length:", storedContent.length);
                            }
                            
                            if (storedContent) {
                                copyToClipboard(storedContent, newCopyButton);
        } else {
                                console.error("No script content found in storage");
                                alert("No script content found to copy");
                            }
                        });
                        
                        // Exit early for async storage operation
                        return;
                    }
                    
                    // If we found content in the UI, copy it directly
                    if (scriptContent) {
                        copyToClipboard(scriptContent, newCopyButton);
        } else {
                        console.error("No script content found in UI");
                        
                        // Try storage as fallback
                        chrome.storage.local.get(['generatedScript', 'generatedScriptString'], function(result) {
                            let storedContent = null;
                            
                            if (result.generatedScript) {
                                if (typeof result.generatedScript === 'object' && result.generatedScript.script) {
                                    storedContent = result.generatedScript.script.trim();
                                } else if (typeof result.generatedScript === 'string') {
                                    storedContent = result.generatedScript.trim();
                                }
                            }
                            
                            if (!storedContent && result.generatedScriptString) {
                                storedContent = result.generatedScriptString.trim();
                            }
                            
                            if (storedContent) {
                                copyToClipboard(storedContent, newCopyButton);
        } else {
                                alert("No script content found to copy");
                            }
                        });
                    }
                } catch (err) {
                    console.error("Error in script copy button handler:", err);
                    alert("Copy failed: " + err.message);
                }
            });
        } else {
            console.warn("Script copy button not found in the DOM");
        }
        
        // Helper function for clipboard operations
        function copyToClipboard(content, buttonElement) {
            if (!content || !content.trim()) {
                console.error("Cannot copy empty content");
                alert("Cannot copy: content is empty");
                return;
            }
            
            console.log("Copying content to clipboard, length:", content.length);
            console.log("First 50 chars:", content.substring(0, 50));
            
            try {
                // Try the modern Clipboard API first
                navigator.clipboard.writeText(content)
                    .then(() => {
                        console.log("Successfully copied to clipboard via Clipboard API");
                        showCopySuccess(buttonElement);
                    })
                    .catch(err => {
                        console.error("Clipboard API failed:", err);
                        
                        // Try fallback
                        if (fallbackCopy(content)) {
                            showCopySuccess(buttonElement);
                        } else {
                            alert("Copy failed: " + err.message);
                        }
                    });
            } catch (err) {
                console.error("Copy error:", err);
                
                // Try fallback in case of exception
                if (fallbackCopy(content)) {
                    showCopySuccess(buttonElement);
        } else {
                    alert("Copy failed: " + err.message);
                }
            }
        }
        
        // Fallback copy method using temporary textarea
        function fallbackCopy(text) {
            console.log("Using fallback copy method");
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                
                // Make the textarea invisible but part of the document
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.pointerEvents = 'none';
                document.body.appendChild(textarea);
                
                // Select and copy
                textarea.focus();
                textarea.select();
                const success = document.execCommand('copy');
                
                // Clean up
                document.body.removeChild(textarea);
                console.log("Fallback copy result:", success ? "success" : "failed");
                return success;
            } catch (err) {
                console.error("Fallback copy failed:", err);
                return false;
            }
        }
        
        // Show success notification
        function showCopySuccess(buttonElement) {
            if (!buttonElement) return;
            
            const originalText = buttonElement.textContent;
            buttonElement.textContent = 'Copied!';
            setTimeout(() => {
                buttonElement.textContent = originalText;
            }, 2000);
            
            // Show a small notification toast
            const toast = document.createElement('div');
            toast.className = 'copy-toast';
            toast.textContent = 'Copied to clipboard!';
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => document.body.removeChild(toast), 300);
                }, 1500);
            }, 10);
        }
    }

    // Save current state
    function saveCurrentState() {
        try {
            // Save test steps
            if (testSteps) {
                chrome.storage.local.set({
                    'robotFrameworkSteps': JSON.stringify(testSteps)
                }, function() {
                    console.log("Test steps saved successfully:", testSteps.length, "steps");
                });
            }
            
            // Save current locator and element info
            if (currentLocator && currentElementInfo) {
                chrome.storage.local.set({
                    'currentLocator': currentLocator,
                    'currentLocatorType': currentLocatorType,
                    'currentElementInfo': JSON.stringify(currentElementInfo)
                }, function() {
                    console.log("Current element state saved");
                });
            }
        } catch (error) {
            console.error('Error saving state:', error);
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request); // Debug log
    
    switch (request.action) {
        case 'updateXPaths':
            updateXPaths(request.xpaths);
            isLocked = request.isLocked;
            updateStatus();
            break;
            
        case 'updateLockStatus':
            isLocked = request.isLocked;
            updateStatus();
            break;
            
        case 'inspectorDeactivated':
            isInspectorActive = false;
            isLocked = false;
            updateStatus();
            break;

        case 'highlightsCleared':
            const resultsDiv = document.getElementById('xpathResults');
            if (resultsDiv) {
                resultsDiv.classList.remove('show');
            }
            break;
            
        case 'updateShortcuts':
            if (request.shortcuts) {
                const statusDiv = document.querySelector('.status-info');
                if (statusDiv) {
                    const shortcutsList = [
                        ...request.shortcuts,
                        'C - Clear highlights'
                    ].map(s => `<li>${s}</li>`).join('');
                    statusDiv.innerHTML = `
                        <div class="status-text">
                            <p><strong>Status:</strong> ${isLocked ? 'Locked' : 'Active'}</p>
                            <p><strong>Shortcuts:</strong></p>
                            <ul>${shortcutsList}</ul>
                        </div>
                    `;
                }
            }
            break;
    }
    return true;
});

// Keep popup state and script when reopened
window.addEventListener('unload', () => {
    console.log("Popup closing - saving state and script");
    
    // Save XPath state
    if (lastXPaths) {
        chrome.storage.local.set({
            lockedState: {
                isLocked: isLocked,
                xpaths: lastXPaths,
                timestamp: Date.now()
            }
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving XPath state:", chrome.runtime.lastError);
            }
        });
    }
    
    try {
        // Make sure the generated script is saved
        const resultContainer = document.getElementById('robotScriptResult');
        const scriptOutput = document.getElementById('scriptOutput');
        
        let scriptContent = '';
        let sourceElement = null;
        
        // First try the textarea (preferred)
        if (resultContainer && resultContainer.value && resultContainer.value.trim()) {
            scriptContent = resultContainer.value;
            sourceElement = 'textarea';
            console.log("Saving script from textarea on unload, length:", scriptContent.length);
        } 
        // Then try the div 
        else if (scriptOutput && scriptOutput.textContent && scriptOutput.textContent.trim()) {
            scriptContent = scriptOutput.textContent;
            sourceElement = 'div';
            console.log("Saving script from div on unload, length:", scriptContent.length);
        }
        // If nothing visible, try to preserve any existing script in storage
        else {
            console.log("No visible script to save, trying to preserve existing storage");
            chrome.storage.local.get(['generatedScript'], (result) => {
                if (result.generatedScript) {
                    // Just verify it exists, don't overwrite
                    console.log("Found existing script in storage, preserving it");
                } else {
                    console.log("No existing script found in storage");
                }
            });
        }
        
        // Only save if we have actual content
        if (scriptContent && scriptContent.trim()) {
            console.log(`Saving script from ${sourceElement} with content length: ${scriptContent.length}`);
            
            // Save directly to storage for better persistence
            chrome.storage.local.set({
                'generatedScript': {
                    script: scriptContent,
                    modelUsed: 'gemini-1.5-flash-latest',
                    timestamp: Date.now(),
                    completed: true,
                    allXPaths: lastXPaths || null,
                    source: sourceElement
                }
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving script to storage on popup close:", chrome.runtime.lastError);
                } else {
                    console.log("Script saved to storage on popup close");
                }
            });
            
            // Also save as simple string for backward compatibility
            chrome.storage.local.set({ 'generatedScriptString': scriptContent }, function() {
                if (chrome.runtime.lastError) {
                    console.error('Error saving script string on unload:', chrome.runtime.lastError);
                } else {
                    console.log('Script string saved successfully on unload');
                }
            });
            
            // Also save a backup with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            chrome.storage.local.set({ [`generatedScript_${timestamp}`]: scriptContent }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving backup script:", chrome.runtime.lastError);
                } else {
                    console.log("Backup script saved with timestamp on unload");
                }
            });
        }
    } catch (err) {
        console.error("Error saving script on unload:", err);
    }
});

// Keep popup alive by preventing default close behavior
window.addEventListener('blur', (event) => {
    if (isLocked) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return true;
    }
});

// Prevent popup from closing when clicking inside it
document.addEventListener('click', (event) => {
    event.stopPropagation();
});

// Prevent popup from closing when interacting with inputs
document.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON') {
        event.stopPropagation();
    }
}); 

    // Helper function to limit XPath length for display
    function limitXPathLength(xpath, maxLength = 60) {
        if (!xpath) return '';
        if (xpath.length <= maxLength) return xpath;
        return xpath.substring(0, maxLength - 3) + '...';
    }

    // Function to update the XPath dropdown with available XPaths
    function updateXPathDropdown(xpaths) {
        const xpathSelector = document.getElementById('xpathSelector');
        if (!xpathSelector) return;
        
        // Clear existing options except the default one
        while (xpathSelector.options.length > 1) {
            xpathSelector.remove(1);
        }
        
        // Safety check for xpaths array
        if (!xpaths || !Array.isArray(xpaths) || xpaths.length === 0) {
            console.warn("No XPaths available to populate dropdown");
            return;
        }
        
        // Group XPaths by category
        const xpathsByCategory = {};
        xpaths.forEach(item => {
            if (!item || !item.category || !item.xpath) return;
            
            if (!xpathsByCategory[item.category]) {
                xpathsByCategory[item.category] = [];
            }
            xpathsByCategory[item.category].push(item);
        });
        
        // Add options by category
        for (const category in xpathsByCategory) {
            // Add category optgroup
            const optgroup = document.createElement('optgroup');
            optgroup.label = category;
            
            // Add options for this category
            xpathsByCategory[category].forEach(item => {
                const option = document.createElement('option');
                option.value = item.xpath;
                option.textContent = limitXPathLength(item.xpath);
                option.title = item.xpath; // Show full XPath on hover
                optgroup.appendChild(option);
            });
            
            xpathSelector.appendChild(optgroup);
        }
        
        // Select the best XPath (first one)
        if (xpaths.length > 0 && xpaths[0] && xpaths[0].xpath) {
            const bestXPath = xpaths[0].xpath;
            for (let i = 0; i < xpathSelector.options.length; i++) {
                if (xpathSelector.options[i].value === bestXPath) {
                    xpathSelector.selectedIndex = i;
                    break;
                }
            }
        }
    }

    // Update status display
    function updateStatus() {
        const toggleButton = document.getElementById('toggleInspector');
        const statusDiv = document.querySelector('.status-info');
        
        toggleButton.textContent = isInspectorActive ? 'Stop Inspection' : 'Start Inspection';
        toggleButton.classList.toggle('active', isInspectorActive);
        
        if (isInspectorActive || isLocked) {
            statusDiv.innerHTML = `
                <div class="status-text">
                    <p><strong>Status:</strong> ${isLocked ? 'Locked' : 'Active'}</p>
                    <p><strong>Shortcuts:</strong></p>
                    <ul>
                        <li>Hover for 1s - Auto-lock element</li>
                        <li>Any key - Unlock</li>
                        <li>Any click - Unlock</li>
                        <li><kbd>ESC</kbd> - Stop inspection</li>
                    </ul>
                </div>
            `;
        } else {
            statusDiv.innerHTML = '';
        }
    }

    // Function to update XPaths displayed in the UI
    function updateXPaths(xpaths) {
    // Re-assign this function to the global variable for cross-reference
    window.updateXPaths = updateXPaths;
        lastXPaths = xpaths;
        
        if (!xpaths) return;
        
        // Update element info if available
        const elementInfoContainer = document.getElementById('elementInfo');
        if (xpaths.elementInfo) {
            const info = xpaths.elementInfo;
            elementInfoContainer.innerHTML = `
                <div class="element-info">
                    <p><strong>Element:</strong> ${info.tagName}</p>
                    ${info.id ? `<p><strong>ID:</strong> ${info.id}</p>` : ''}
                    ${info.className ? `<p><strong>Class:</strong> ${info.className}</p>` : ''}
                    ${info.type ? `<p><strong>Type:</strong> ${info.type}</p>` : ''}
                    ${info.name ? `<p><strong>Name:</strong> ${info.name}</p>` : ''}
                    ${info.value ? `<p><strong>Value:</strong> ${info.value}</p>` : ''}
                    ${info.placeholder ? `<p><strong>Placeholder:</strong> ${info.placeholder}</p>` : ''}
                    ${info.text ? `<p><strong>Text:</strong> ${info.text.substring(0, 100)}${info.text.length > 100 ? '...' : ''}</p>` : ''}
                    ${info.role ? `<p><strong>Role:</strong> ${info.role}</p>` : ''}
                </div>
            `;
            elementInfoContainer.style.display = 'block';
            
            // Store element info for Robot Framework use
            currentElementInfo = info;
        }

        // Store the best XPath for Robot Framework use
        if (xpaths) {
            try {
                console.log("Received XPaths:", xpaths);
                
                // First, collect all available XPaths into an array for easy selection
                const allAvailableXPaths = [];
                
                // Add unique identifiers (highest priority)
                if (xpaths.uniqueXPaths && Array.isArray(xpaths.uniqueXPaths)) {
                    xpaths.uniqueXPaths.forEach(item => {
                        if (item && typeof item.xpath === 'string') {
                            allAvailableXPaths.push({
                                category: 'Unique Identifier',
                                xpath: item.xpath,
                                priority: 1
                            });
                        }
                    });
                }
                
                // Add form-specific XPaths (high priority)
                if (xpaths.formXPaths && Array.isArray(xpaths.formXPaths)) {
                    xpaths.formXPaths.forEach(item => {
                        if (item && typeof item.xpath === 'string') {
                            allAvailableXPaths.push({
                                category: 'Form Element',
                                xpath: item.xpath,
                                priority: 2
                            });
                        }
                    });
                }
                
                // Add specialized XPaths (high priority)
                if (xpaths.specializedXPaths && Array.isArray(xpaths.specializedXPaths)) {
                    xpaths.specializedXPaths.forEach(item => {
                        if (item && typeof item.xpath === 'string') {
                            allAvailableXPaths.push({
                                category: 'Specialized',
                                xpath: item.xpath,
                                priority: 3
                            });
                        }
                    });
                }
                
                // Add all other XPath categories
                if (xpaths.xpaths) {
                    console.log("Processing xpaths object:", xpaths.xpaths);
                    
                    // Class-based
                    if (xpaths.xpaths.classBased && Array.isArray(xpaths.xpaths.classBased)) {
                        xpaths.xpaths.classBased.forEach(item => {
                            if (item && typeof item.xpath === 'string') {
                                allAvailableXPaths.push({
                                    category: 'Class-based',
                                    xpath: item.xpath,
                                    priority: 4
                                });
                            }
                        });
                    }
                    
                    // Role-based
                    if (xpaths.xpaths.roleBased && Array.isArray(xpaths.xpaths.roleBased)) {
                        xpaths.xpaths.roleBased.forEach(item => {
                            if (item && typeof item.xpath === 'string') {
                                allAvailableXPaths.push({
                                    category: 'Role-based',
                                    xpath: item.xpath,
                                    priority: 4
                                });
                            }
                        });
                    }
                    
                    // Text/Value-based
                    if (xpaths.xpaths.textValue && Array.isArray(xpaths.xpaths.textValue)) {
                        xpaths.xpaths.textValue.forEach(item => {
                            if (item && typeof item.xpath === 'string') {
                                allAvailableXPaths.push({
                                    category: 'Text/Value-based',
                                    xpath: item.xpath,
                                    priority: 4
                                });
                            }
                        });
                    }
                    
                    // Class + Role + Text
                    if (xpaths.xpaths.classRoleText && Array.isArray(xpaths.xpaths.classRoleText)) {
                        xpaths.xpaths.classRoleText.forEach(item => {
                            if (item && typeof item.xpath === 'string') {
                                allAvailableXPaths.push({
                                    category: 'Class + Role + Text',
                                    xpath: item.xpath,
                                    priority: 5
                                });
                            }
                        });
                    }
                    
                    // All other categories
                    const otherCategories = [
                        { key: 'classRoleValue', name: 'Class + Role + Value' },
                        { key: 'classRoleIndex', name: 'Class + Role + Index' },
                        { key: 'classTextValue', name: 'Class + Text + Value' },
                        { key: 'parentRole', name: 'Parent Role + Current Role' },
                        { key: 'roleAttribute', name: 'Role + Class/Text' },
                        { key: 'multipleRoles', name: 'Multiple Parent Roles' },
                        { key: 'parentContext', name: 'Parent Context' },
                        { key: 'verticalRelative', name: 'Above/Below' },
                        { key: 'horizontalRelative', name: 'Left/Right' },
                        { key: 'nearRelative', name: 'Near Elements' }
                    ];
                    
                    otherCategories.forEach(category => {
                        if (xpaths.xpaths[category.key] && Array.isArray(xpaths.xpaths[category.key])) {
                            xpaths.xpaths[category.key].forEach(item => {
                                if (item && typeof item.xpath === 'string') {
                                    allAvailableXPaths.push({
                                        category: category.name,
                                        xpath: item.xpath,
                                        priority: 5
                                    });
                                }
                            });
                        }
                    });
                }
                
                console.log("Collected XPaths:", allAvailableXPaths);
                
                // Sort by priority and pick the best one
                if (allAvailableXPaths.length > 0) {
                    allAvailableXPaths.sort((a, b) => a.priority - b.priority);
                    currentLocator = allAvailableXPaths[0].xpath;
                    
                    // Store all available XPaths
                    window.allAvailableXPaths = allAvailableXPaths;
                    
                    // Create XPath dropdown in the action builder
                    updateXPathDropdown(allAvailableXPaths);
                } else {
                    console.warn("No XPaths were collected for the dropdown");
                    // If no XPaths were collected but we have an element info, use the raw XPath
                    if (xpaths.elementInfo && xpaths.elementInfo.xpath) {
                        currentLocator = xpaths.elementInfo.xpath;
                        console.log("Falling back to raw XPath:", currentLocator);
                        window.allAvailableXPaths = [{
                            category: 'Raw XPath',
                            xpath: xpaths.elementInfo.xpath,
                            priority: 1
                        }];
                        updateXPathDropdown(window.allAvailableXPaths);
                    }
                }
                
                // Update the locator type based on the element
                const locatorTypeSelect = document.getElementById('locatorType');
                if (locatorTypeSelect && currentElementInfo) {
                    if (currentElementInfo.id) {
                        locatorTypeSelect.value = 'id';
                        currentLocatorType = 'id';
                    } else if (currentElementInfo.name) {
                        locatorTypeSelect.value = 'name';
                        currentLocatorType = 'name';
                    } else {
                        locatorTypeSelect.value = 'xpath';
                        currentLocatorType = 'xpath';
                    }
                }
            } catch (error) {
                console.error("Error processing XPaths:", error);
                // Fall back to a simple XPath if available through elementInfo
                if (xpaths.elementInfo && xpaths.elementInfo.xpath) {
                    currentLocator = xpaths.elementInfo.xpath;
                    console.log("Falling back to raw XPath:", currentLocator);
                }
            }
        }
        
        // Update unique identifiers container
        const uniqueContainer = document.getElementById('uniqueXPathsContainer');
        if (uniqueContainer && xpaths.uniqueXPaths) {
            uniqueContainer.innerHTML = '';
            
            if (xpaths.uniqueXPaths.length === 0) {
                uniqueContainer.innerHTML = '<div class="empty-message">No unique identifiers found</div>';
            } else {
                xpaths.uniqueXPaths.forEach(xpath => {
                    uniqueContainer.appendChild(createXPathItem(xpath.xpath, xpath.type || 'id'));
                });
            }
        }

        // Update specialized XPaths container
        const specializedContainer = document.getElementById('specializedXPathsContainer');
        if (specializedContainer && xpaths.specializedXPaths) {
            specializedContainer.innerHTML = '';
            
            if (xpaths.specializedXPaths.length === 0) {
                specializedContainer.innerHTML = '<div class="empty-message">No specialized XPaths found</div>';
            } else {
                xpaths.specializedXPaths.forEach(xpath => {
                    specializedContainer.appendChild(createXPathItem(xpath.xpath, xpath.type || 'special'));
                });
            }
        }
        
        // Update form XPaths container
        const formContainer = document.getElementById('formXPathsContainer');
        if (formContainer && xpaths.formXPaths) {
            formContainer.innerHTML = '';
            
            if (xpaths.formXPaths.length === 0) {
                formContainer.innerHTML = '<div class="empty-message">No form-specific XPaths found</div>';
            } else {
                xpaths.formXPaths.forEach(xpath => {
                    formContainer.appendChild(createXPathItem(xpath.xpath, xpath.type || 'form'));
                });
            }
        }
        
        // ... Existing code for other XPath containers ...
        
        // Update other categories
        if (xpaths.xpaths) {
            // Class-based
            updateCategory('classBasedContainer', xpaths.xpaths.classBased || []);
            
            // Role-based
            updateCategory('roleBasedContainer', xpaths.xpaths.roleBased || []);
            
            // Text/Value-based
            updateCategory('textValueContainer', xpaths.xpaths.textValue || []);
            
            // Class + Role + Text
            updateCategory('classRoleTextContainer', xpaths.xpaths.classRoleText || []);
            
            // Class + Role + Value
            updateCategory('classRoleValueContainer', xpaths.xpaths.classRoleValue || []);
            
            // Class + Role + Index
            updateCategory('classRoleIndexContainer', xpaths.xpaths.classRoleIndex || []);
            
            // Class + Text + Value
            updateCategory('classTextValueContainer', xpaths.xpaths.classTextValue || []);
            
            // Parent Role
            updateCategory('parentRoleContainer', xpaths.xpaths.parentRole || []);
            
            // Role + Attribute
            updateCategory('roleAttributeContainer', xpaths.xpaths.roleAttribute || []);
            
            // Multiple Roles
            updateCategory('multipleRolesContainer', xpaths.xpaths.multipleRoles || []);
            
            // Parent Context
            updateCategory('parentContextContainer', xpaths.xpaths.parentContext || []);
            
            // Vertical Relative
            updateCategory('verticalRelativeContainer', xpaths.xpaths.verticalRelative || []);
            
            // Horizontal Relative
            updateCategory('horizontalRelativeContainer', xpaths.xpaths.horizontalRelative || []);
            
            // Near Relative
            updateCategory('nearRelativeContainer', xpaths.xpaths.nearRelative || []);
        }
        
        setupCopyButtons();
        saveCurrentState();

        // Helper function to update a category container
        function updateCategory(containerId, items) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            container.innerHTML = '';
            
            // Create fallback XPath if items is empty
            if (!items || items.length === 0) {
                // Create a placeholder message that looks better than "None found"
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'xpath-placeholder';
                emptyMessage.textContent = 'No matching XPaths found for this category';
                container.appendChild(emptyMessage);
                return;
            }
            
            items.forEach(item => {
                if (!item || !item.xpath) {
                    console.warn("Invalid XPath item:", item);
                    return;
                }
                container.appendChild(createXPathItem(item.xpath, item.type || 'xpath'));
            });
        }
    }

    // Initialize the extension
    function initialize() {
        try {
            // Reset UI state
            const loadingElement = document.getElementById('scriptLoading');
            const errorElement = document.getElementById('scriptError');
            const modelInfoElement = document.getElementById('modelInfo');
            
            if (loadingElement) loadingElement.style.display = 'none';
            if (errorElement) errorElement.style.display = 'none';
            if (modelInfoElement) modelInfoElement.style.display = 'none';
            
            // Initialize basic state
            updateStatus();
            updateXPaths();
            
            // Initialize API key
            initializeApiKey();
            
            // Restore saved data
            restoreState();
            
            // Restore any previously generated script
            restoreGeneratedScript();
            
            // Setup event delegation for copy buttons
            document.addEventListener('click', function(e) {
                if (e.target && e.target.classList.contains('copy-button')) {
                    const value = e.target.getAttribute('data-value');
                    if (value) {
                        navigator.clipboard.writeText(value)
                            .then(() => {
                                const originalText = e.target.textContent;
                                e.target.textContent = 'Copied!';
                                setTimeout(() => {
                                    e.target.textContent = originalText;
                                }, 1500);
                            })
                            .catch(err => {
                                console.error('Failed to copy: ', err);
                            });
                    }
                }
            });
            
            // Set button text to emphasize gemini-1.5-flash-latest
            const generateButton = document.getElementById('generateScriptButton');
            if (generateButton) {
                const modelText = generateButton.querySelector('.button-model');
                if (modelText) {
                    modelText.textContent = 'using gemini-1.5-flash-latest';
                }
            }
            
            console.log('Popup initialized');
        } catch (error) {
            console.error('Error during popup initialization:', error);
        }
    }
}); 

// Declare updateScriptLoadingStatus in the global scope so it's available everywhere
window.updateScriptLoadingStatus = function(message, progress = null) {
    console.log(`Status update: ${message}, progress: ${progress}`);
    
    try {
        // Make sure the loading element is visible
        const loadingElement = document.getElementById('scriptLoading');
        if (!loadingElement) {
            console.error("Loading element not found");
            return;
        }
        
        loadingElement.style.display = 'flex';
        
        // Update text message
        const generationStatus = loadingElement.querySelector('.generation-status');
        if (generationStatus) {
            const statusSpan = generationStatus.querySelector('span');
            if (statusSpan) {
                statusSpan.textContent = message;
            } else {
                // Create span if it doesn't exist
                const newSpan = document.createElement('span');
                newSpan.textContent = message;
                generationStatus.appendChild(newSpan);
            }
        }
        
        // Update progress bar if provided
        if (progress !== null) {
            const progressBar = loadingElement.querySelector('.progress-bar');
            if (progressBar) {
                let progressFill = progressBar.querySelector('.progress-fill');
                if (!progressFill) {
                    // Create progress fill if it doesn't exist
                    progressFill = document.createElement('div');
                    progressFill.className = 'progress-fill';
                    progressBar.appendChild(progressFill);
                }
                
                // Remove animation if we're setting specific progress
                progressFill.style.animation = 'none';
                progressFill.style.width = `${progress}%`;
            }
        }
        
        // Show test script output container
        const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
        if (testScriptOutputContainer) {
            testScriptOutputContainer.style.display = 'block';
        }
    } catch (error) {
        console.error("Error updating script status:", error);
    }
};

// Handle generate script button click - declared in global scope
window.handleGenerateScriptClick = async function() {
    console.log("Generate script button clicked");
    
    // Make sure testScriptOutputContainer is visible
    const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
    if (testScriptOutputContainer) {
        testScriptOutputContainer.style.display = 'block';
    }
    
    // Find all the required UI elements
    const resultContainer = document.getElementById('robotScriptResult');
    const scriptOutput = document.getElementById('scriptOutput');
    const loadingElement = document.getElementById('scriptLoading');
    const errorElement = document.getElementById('scriptError');
    const scriptStatusContainer = document.getElementById('scriptStatusContainer');
    
    // Use whichever output element is available
    const outputElement = resultContainer || scriptOutput;
    
    if (!outputElement || !loadingElement || !errorElement) {
        console.error("Required UI elements not found");
        alert("Error: Required UI elements not found. Please reload the extension.");
        return;
    }
    
    console.log("UI elements found:", {
        resultContainer: !!resultContainer,
        scriptOutput: !!scriptOutput,
        loadingElement: !!loadingElement,
        errorElement: !!errorElement,
        scriptStatusContainer: !!scriptStatusContainer
    });
    
    if (testSteps.length === 0) {
        errorElement.textContent = 'No test steps to generate a script from';
        errorElement.style.display = 'block';
        loadingElement.style.display = 'none';
        if (scriptStatusContainer) scriptStatusContainer.innerHTML = '';
        return;
    }
    
    // Check API key first
    if (!geminiApiKey || geminiApiKey === 'YOUR_GEMINI_API_KEY') {
        // Show API key input form
        const geminiApiKeyForm = document.getElementById('geminiApiKeyForm');
        if (geminiApiKeyForm) {
            geminiApiKeyForm.style.display = 'block';
        }
        errorElement.textContent = 'Please provide a valid API key for gemini-1.5-flash-latest model';
        errorElement.style.display = 'block';
        loadingElement.style.display = 'none';
        if (scriptStatusContainer) scriptStatusContainer.innerHTML = '';
        return;
    }
    
    // Reset UI
    if (outputElement) {
        outputElement.value = '';
        outputElement.style.display = 'none';
    }
    
    errorElement.style.display = 'none';
    loadingElement.style.display = 'flex';
    
    // Show loading animation with status using global function
    window.updateScriptLoadingStatus("Preparing for script generation...", 10);
    
    // Make sure we have gathered XPaths before continuing
    if (!lastXPaths && currentElementInfo) {
        console.log("Initializing XPath collection...");
        try {
            // Send a message to collect XPaths if needed
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs && tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'getXPaths' }, function(response) {
                        if (chrome.runtime.lastError) {
                            console.error("Error getting XPaths:", chrome.runtime.lastError);
                        } else if (response && response.xpaths) {
                            console.log("Got XPaths from content script:", response.xpaths);
                            lastXPaths = response.xpaths;
                        }
                    });
                }
            });
        } catch (e) {
            console.error("Error initializing XPath collection:", e);
        }
    }
    
    // Create structured details for the background worker
    const xpathDetails = {
        steps: testSteps.map(step => ({
            actionType: step.actionType,
            elementName: step.elementName,
            locatorType: step.locatorType,
            locator: step.locator,
            value: step.value || null,
            elementInfo: step.elementInfo || null
        })),
        allXPaths: lastXPaths || null
    };
    
    try {
        console.log("Starting background script generation with steps:", xpathDetails);
        
        // Save API key for background service worker to use
        await saveApiKey(geminiApiKey);
        
        // Update UI to show processing
        if (outputElement) {
            outputElement.value = "Starting script generation in background. This will continue even if you close the popup...";
            outputElement.style.display = 'block';
        }
        
        window.updateScriptLoadingStatus("Connecting to gemini-1.5-flash-latest API...", 30);
        
        if (scriptStatusContainer) {
            scriptStatusContainer.innerHTML = 
                `<div class="status-message processing">
                    <span>&#8987; Generating script in background...</span>
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                </div>`;
        }
        
        // Send message to background service worker
        chrome.runtime.sendMessage({
            action: 'generateRobotScript',
            data: xpathDetails
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error starting background generation:", chrome.runtime.lastError);
                
                if (outputElement) {
                    outputElement.value = `Error starting background generation: ${chrome.runtime.lastError.message}`;
                    outputElement.style.display = 'block';
                }
                
                window.updateScriptLoadingStatus("Error starting script generation", 100);
                loadingElement.style.display = 'none';
                return;
            }
            
            console.log("Background script generation started:", response);
            window.updateScriptLoadingStatus("Script generation started in background", 50);
            
            // Start polling for status
            window.startScriptStatusPolling = startScriptStatusPolling;
            window.startScriptStatusPolling();
        });
    } catch (error) {
        console.error("Error setting up background generation:", error);
        
        if (outputElement) {
            outputElement.value = `Error: ${error.message}`;
            outputElement.style.display = 'block';
        }
        
        window.updateScriptLoadingStatus("Error: " + error.message, 100);
        loadingElement.style.display = 'none';
    }
}


function generateRobotScriptFromSteps(steps, url = '', browser = 'Chrome') {
    const lines = [
        '*** Settings ***',
        'Library    SeleniumLibrary',
        '',
        '*** Variables ***',
        `\${URL}              ${url}`,
        `\${BROWSER}          ${browser}`,
        '',
        '*** Test Cases ***',
        'Recorded Test',
        '    Open Browser    ${URL}    ${BROWSER}',
        '    Maximize Browser Window'
    ];

    let lastLocator = '';

    steps.forEach((step) => {
        let rawLocator = typeof step.xpath === 'string' ? step.xpath : step.xpath?.xpath || '';

        // Fallback for poor @value xpaths — prefer placeholder
        if (rawLocator.includes('@value=') && step.elementInfo?.attributes?.placeholder) {
            rawLocator = `//input[@placeholder='${step.elementInfo.attributes.placeholder}']`;
        }

        // Filter invalid locator
        if (!rawLocator || typeof rawLocator !== 'string' || rawLocator.includes('[object Object]')) {
            lines.push(`    # Skipped step with invalid XPath`);
            return;
        }

        const locator = rawLocator.startsWith('xpath=') ? rawLocator : `xpath=${rawLocator}`;
        const type = step.type?.toLowerCase() || '';
        const value = step.value?.trim?.() || '';
        const nameAttr = step.name || '';
        const tag = step.tag?.toLowerCase() || '';

        if (locator !== lastLocator) {
            lines.push(`    Wait Until Element Is Visible    ${locator}    5s`);
        }

        switch (type) {
            case 'radio':
                if (nameAttr && value) {
                    lines.push(`    Select Radio Button    ${nameAttr}    ${value}`);
                } else {
                    lines.push(`    Click Element    ${locator}    # fallback radio`);
                }
                break;

            case 'checkbox':
                lines.push(`    Select Checkbox    ${locator}`);
                break;

            case 'dropdown':
                lines.push(`    Select From List By Label    ${locator}    ${value}`);
                break;

            case 'click':
                if (tag === 'a') {
                    lines.push(`    Click Link    ${locator}`);
                } else if (tag === 'button') {
                    lines.push(`    Click Button    ${locator}`);
                } else {
                    lines.push(`    Click Element    ${locator}`);
                }
                break;

            case 'toggle':
                lines.push(`    Click Element    ${locator}    # Toggle ${value}`);
                break;

            case 'input':
                lines.push(`    Input Text    ${locator}    ${value}`);
                break;

            case 'keydown':
            case 'keyDown':
                if (step.key === 'Enter') {
                    lines.push(`    Press Keys    ${locator}    ENTER`);
                }
                break;

            default:
                lines.push(`    # Unknown step type: ${type}`);
        }

        lines.push('    Capture Page Screenshot');
        lastLocator = locator;
    });

    lines.push('    Close Browser');
    return lines.join('\n');
}



document.getElementById('generateScript').addEventListener('click', async () => {
    chrome.storage.local.get('recordedSteps', async (res) => {
        const steps = res.recordedSteps || [];

        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const url = tabs[0]?.url || '';
            try {
                const aiScript = await enhanceStepsWithAI(steps, url);
                document.getElementById('robotScript').value = aiScript;
            } catch (err) {
                console.error('Gemini failed, showing fallback:', err);
                const fallback = generateRobotScriptFromSteps(steps, url);
                document.getElementById('robotScript').value = fallback;
            }
        });
    });
});



document.getElementById('clearRecordedSteps').addEventListener('click', () => {
    chrome.storage.local.set({ recordedSteps: [] }, () => {
        document.getElementById('stepList').innerHTML = 'No steps.';
    });
});






// Function to save the generated script to storage
function saveGeneratedScript(scriptContent) {
    if (!scriptContent) {
        console.error('No script content provided to save');
        return;
    }
    
    if (typeof scriptContent !== 'string') {
        console.error('Invalid script content type:', typeof scriptContent);
        return;
    }
    
    console.log('Saving generated script to storage, length:', scriptContent.length);
    
    try {
        // Create a well-structured object for storage
        const scriptData = {
            script: scriptContent,
            modelUsed: 'gemini-1.5-flash-latest',
            timestamp: Date.now(),
            completed: true,
            allXPaths: lastXPaths || null
        };
        
        // Save directly to storage - using both callback and Promise for robustness
        const savePromise = new Promise((resolve, reject) => {
            chrome.storage.local.set({ 'generatedScript': scriptData }, function() {
                if (chrome.runtime.lastError) {
                    console.error('Error saving script to storage:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    console.log('Script saved successfully via callback');
                    resolve();
                }
            });
        });
        
        // Also save as simple string for backward compatibility
        chrome.storage.local.set({ 'generatedScriptString': scriptContent }, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving script string:', chrome.runtime.lastError);
            } else {
                console.log('Script string saved successfully');
            }
        });
        
        // Also save a backup copy with a timestamp key for redundancy
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        chrome.storage.local.set({ [`generatedScript_${timestamp}`]: {
            script: scriptContent,
            modelUsed: 'gemini-1.5-flash-latest',
            timestamp: Date.now(),
            completed: true
        }}, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving backup script:', chrome.runtime.lastError);
            } else {
                console.log('Backup script saved with timestamp:', timestamp);
            }
        });
        
        // Return the promise for potential await usage
        return savePromise;
    } catch (err) {
        console.error('Exception in saveGeneratedScript:', err);
        return Promise.reject(err);
    }
}

// Function to load and display previous scripts
function loadPreviousScripts() {
    console.log("Loading previous scripts...");
    
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Previously Generated Scripts</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <div class="loading-spinner mini">
                    <div class="spinner"></div>
                    <span>Loading scripts...</span>
                </div>
                <div id="previousScriptsList" class="scripts-list"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add some basic styles if not already present
    if (!document.getElementById('modal-styles')) {
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            .modal {
                display: block;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.4);
            }
            .modal-content {
                background-color: #fefefe;
                margin: 10% auto;
                padding: 20px;
                border: 1px solid #888;
                width: 80%;
                max-width: 600px;
                border-radius: 8px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
            }
            .close-modal {
                color: #aaa;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
            }
            .close-modal:hover {
                color: #000;
            }
            .scripts-list {
                margin-top: 15px;
            }
            .script-item {
                padding: 10px;
                border: 1px solid #ddd;
                margin-bottom: 10px;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .script-item:hover {
                background-color: #f5f5f5;
            }
            .script-item-header {
                display: flex;
                justify-content: space-between;
                font-weight: bold;
                margin-bottom: 5px;
            }
            .script-item-info {
                font-size: 0.9em;
                color: #666;
            }
            .script-item-preview {
                margin-top: 8px;
                font-family: monospace;
                font-size: 0.85em;
                background-color: #f9f9f9;
                padding: 5px;
                border-radius: 3px;
                max-height: 80px;
                overflow-y: hidden;
                white-space: pre-wrap;
                color: #333;
            }
            .mini.loading-spinner {
                justify-content: center;
                height: auto;
                padding: 20px 0;
            }
            .mini .spinner {
                width: 30px;
                height: 30px;
                margin-right: 10px;
            }
            .no-scripts {
                text-align: center;
                padding: 20px;
                color: #666;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Close modal when clicking the X
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Close modal when clicking outside the content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Get all script-related items from storage
    chrome.storage.local.get(null, (result) => {
        const scriptsList = document.getElementById('previousScriptsList');
        const loadingSpinner = modal.querySelector('.loading-spinner');
        
        // Hide loading spinner
        loadingSpinner.style.display = 'none';
        
        // Find all script keys
        const scriptKeys = Object.keys(result).filter(key => 
            key === 'generatedScript' || 
            key === 'generatedScriptString' || 
            key.startsWith('generatedScript_')
        );
        
        console.log(`Found ${scriptKeys.length} script entries`);
        
        if (scriptKeys.length === 0) {
            scriptsList.innerHTML = '<div class="no-scripts">No previously generated scripts found</div>';
            return;
        }
        
        // Process and display each script
        let scriptsData = [];
        
        scriptKeys.forEach(key => {
            let content = result[key];
            let timestamp = new Date().toISOString();
            let source = 'Unknown';
            
            // Extract structured data if available
            if (typeof content === 'object' && content !== null) {
                timestamp = content.timestamp ? new Date(content.timestamp).toISOString() : timestamp;
                source = content.modelUsed || 'Gemini';
                content = content.script || JSON.stringify(content);
            }
            
            // Extract timestamp from backup key name if available
            if (key.startsWith('generatedScript_')) {
                try {
                    // Extract the timestamp part from the key
                    const rawTimestamp = key.replace('generatedScript_', '');
                    
                    // Special catch-all for the problematic format we've seen repeatedly
                    if (rawTimestamp.match(/2025-06-20T08:16:34-966Z/i)) {
                        // Directly provide a known good timestamp
                        timestamp = "2025-06-20T08:16:34.000Z";
                        console.log("Replaced known problematic timestamp with fixed version");
                        return; // Exit early with the fixed timestamp
                    }
                    
                    // Check for the specific format issue (T replaced with 0)
                    if (rawTimestamp.match(/^\d{4}-\d{2}-\d{2}0\d{2}:/)) {
                        const fixedTimestamp = rawTimestamp.replace(/(\d{4}-\d{2}-\d{2})0/, "$1T");
                        timestamp = fixedTimestamp;
                        console.log("Fixed timestamp key format:", rawTimestamp, "->", fixedTimestamp);
                    } 
                    // Check standard ISO format with T
                    else if (rawTimestamp.includes('T')) {
                        const parts = rawTimestamp.split('T');
                        if (parts.length === 2) {
                            // Convert to standard ISO format
                            const datePart = parts[0]; // already has proper dashes
                            // Time part needs colons instead of dashes, except for milliseconds
                            let timePart = parts[1];
                            
                            // Replace dashes with colons for the first two instances (HH-MM-SS)
                            const matches = timePart.match(/^(\d+)-(\d+)-(\d+)/);
                            if (matches && matches.length >= 4) {
                                timePart = `${matches[1]}:${matches[2]}:${matches[3]}${timePart.substring(matches[0].length)}`;
                            }
                            
                            // Final cleanup - make sure Z is at the end if present
                            if (!timePart.endsWith('Z') && timePart.includes('Z')) {
                                timePart = timePart.replace('Z', '') + 'Z';
                            }
                            
                            // Create ISO string
                            const isoString = `${datePart}T${timePart}`;
                            
                            // Test if it's valid
                            const testDate = new Date(isoString);
                            if (!isNaN(testDate.getTime())) {
                                timestamp = isoString;
                                console.log("Successfully parsed timestamp:", timestamp);
                            } else {
                                console.warn("Failed to create valid date from:", isoString);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Error parsing timestamp from key:", key, e);
                }
            }
            
            if (typeof content === 'string' && content.trim()) {
                scriptsData.push({
                    key: key,
                    content: content,
                    timestamp: timestamp,
                    source: source,
                    preview: content.substring(0, 150) + (content.length > 150 ? '...' : '')
                });
            }
        });
        
        // Sort by timestamp (newest first)
        scriptsData.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Display the scripts
        scriptsList.innerHTML = scriptsData.map((script, index) => {
            // Use our safe date functions
            const date = safeCreateDate(script.timestamp);
            const formattedDate = safeFormatDate(date);
            
            return `
                <div class="script-item" data-index="${index}">
                    <div class="script-item-header">
                        <span>Script ${index + 1}</span>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="script-item-info">
                        Source: ${script.source}
                    </div>
                    <div class="script-item-preview">${script.preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
            `;
        }).join('');
        
        // Add click handlers to load scripts
        scriptsList.querySelectorAll('.script-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const scriptData = scriptsData[index];
                
                if (scriptData && scriptData.content) {
                    // Load the script into the editor
                    const resultContainer = document.getElementById('robotScriptResult');
                    const scriptOutput = document.getElementById('scriptOutput');
                    const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
                    
                    // Use textarea if available, otherwise fallback to div
                    if (resultContainer) {
                        resultContainer.value = scriptData.content;
                        resultContainer.style.display = 'block';
                    } else if (scriptOutput) {
                        scriptOutput.textContent = scriptData.content;
                        scriptOutput.style.display = 'block';
                    }
                    
                    // Show container
                    if (testScriptOutputContainer) {
                        testScriptOutputContainer.style.display = 'block';
                    }
                    
                    // Update model info
                    const modelInfoElement = document.getElementById('modelInfo');
                    if (modelInfoElement) {
                        // Use our safe date functions
                        const date = safeCreateDate(scriptData.timestamp);
                        const formattedDate = safeFormatDate(date);
                        
                        modelInfoElement.textContent = `Reloaded at ${formattedDate} from ${scriptData.source}`;
                        modelInfoElement.style.display = 'block';
                    }
                    
                    // Show status message
                    const scriptStatusContainer = document.getElementById('scriptStatusContainer');
                    if (scriptStatusContainer) {
                        // Get current time for the status message
                        const now = new Date();
                        let timeString;
                        try {
                            timeString = new Intl.DateTimeFormat('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                            }).format(now);
                        } catch (e) {
                            console.error('Error formatting time:', e);
                            timeString = 'just now';
                        }
                        
                        scriptStatusContainer.innerHTML = 
                            `<div class="status-message success mini">
                                <span>&#x2705; Script loaded at ${timeString}</span>
                            </div>`;
                    }
                    
                    // Hide loading spinner if visible
                    const loadingElement = document.getElementById('scriptLoading');
                    if (loadingElement) {
                        loadingElement.style.display = 'none';
                    }
                    
                    // Also save as current script
                    saveGeneratedScript(scriptData.content);
                    
                    // Close the modal
                    document.body.removeChild(modal);
                }
            });
        });
    });
}

// Function to directly restore previous scripts (for offline mode)
function restorePreviousScripts(showSuccess = false) {
    console.log("Restoring previous scripts for offline mode");
    
    chrome.storage.local.get(null, (data) => {
        // Look for the most recent script
        const scriptKeys = Object.keys(data).filter(key => 
            key.startsWith('generatedScript_') ||
            key === 'generatedScript' ||
            key === 'generatedScriptString'
        );
        
        if (scriptKeys.length === 0) {
            console.log("No previous scripts found");
            return;
        }
        
        console.log(`Found ${scriptKeys.length} previous scripts`);
        
        // Sort timestamp keys to get the newest one first
        const timestampKeys = scriptKeys.filter(key => key.startsWith('generatedScript_'));
        timestampKeys.sort().reverse();
        
        // Try to get the most recent script
        let scriptContent = null;
        let sourceKey = null;
        
        // First try the newest timestamped key
        if (timestampKeys.length > 0) {
            sourceKey = timestampKeys[0];
            const scriptData = data[sourceKey];
            
            if (typeof scriptData === 'object' && scriptData !== null && scriptData.script) {
                scriptContent = scriptData.script;
            } else if (typeof scriptData === 'string') {
                scriptContent = scriptData;
            }
        }
        
        // If that failed, try the main storage key
        if (!scriptContent && data.generatedScript) {
            sourceKey = 'generatedScript';
            if (typeof data.generatedScript === 'object' && data.generatedScript !== null && data.generatedScript.script) {
                scriptContent = data.generatedScript.script;
            } else if (typeof data.generatedScript === 'string') {
                scriptContent = data.generatedScript;
            }
        }
        
        // Last resort, try the string backup
        if (!scriptContent && data.generatedScriptString) {
            sourceKey = 'generatedScriptString';
            scriptContent = data.generatedScriptString;
        }
        
        // If we found content, display it
        if (scriptContent) {
            console.log(`Restoring script from ${sourceKey}, length: ${scriptContent.length}`);
            
            // Get output elements
            const resultContainer = document.getElementById('robotScriptResult');
            const scriptOutput = document.getElementById('scriptOutput');
            const testScriptOutputContainer = document.getElementById('testScriptOutputContainer');
            
            // Display script in the first available output element
            if (resultContainer) {
                resultContainer.value = scriptContent;
                resultContainer.style.display = 'block';
            } else if (scriptOutput) {
                scriptOutput.textContent = scriptContent;
                scriptOutput.style.display = 'block';
            }
            
            // Show container
            if (testScriptOutputContainer) {
                testScriptOutputContainer.style.display = 'block';
            }
            
            // Show success message if requested
            if (showSuccess) {
                const scriptStatusContainer = document.getElementById('scriptStatusContainer');
                if (scriptStatusContainer) {
                    const now = new Date();
                    let timeString;
                    try {
                        timeString = new Intl.DateTimeFormat('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                        }).format(now);
                    } catch (e) {
                        timeString = 'now';
                    }
                    
                    scriptStatusContainer.innerHTML = 
                        `<div class="status-message success mini">
                            <span>&#x2705; Script loaded at ${timeString}</span>
                        </div>`;
                }
            }
        }
    });
}

// Function to clean up malformed timestamps in storage
function cleanupStoredTimestamps() {
    console.log("Starting timestamp cleanup process");
    
    try {
        chrome.storage.local.get(null, (items) => {
            // Find all script keys
            const scriptKeys = Object.keys(items).filter(key => 
                key === 'generatedScript' || 
                key === 'generatedScriptString' || 
                key.startsWith('generatedScript_')
            );
            
            console.log(`Found ${scriptKeys.length} script keys to check for timestamp issues`);
            
            // Check each key for timestamp issues
            scriptKeys.forEach(key => {
                if (key.startsWith('generatedScript_')) {
                    // Check if the key contains a malformed timestamp
                    const rawTimestamp = key.replace('generatedScript_', '');
                    
                    // Look for the specific issue (T replaced with 0)
                    if (rawTimestamp.match(/^\d{4}-\d{2}-\d{2}0\d{2}/) || 
                        rawTimestamp.includes(':') || 
                        !rawTimestamp.includes('T') && rawTimestamp.includes('-')) {
                        
                        // Try to create a corrected key
                        let fixedTimestamp = rawTimestamp;
                        
                        // Fix the T replaced with 0 issue
                        if (fixedTimestamp.match(/^\d{4}-\d{2}-\d{2}0\d{2}/)) {
                            fixedTimestamp = fixedTimestamp.replace(/(\d{4}-\d{2}-\d{2})0/, "$1T");
                        }
                        
                        // Fix other common issues
                        fixedTimestamp = fixedTimestamp.replace(/:/g, '-');
                        
                        // Create new key
                        const newKey = `generatedScript_${fixedTimestamp}`;
                        
                        if (newKey !== key) {
                            console.log(`Fixing key: ${key} -> ${newKey}`);
                            
                            // Move the data to the new key
                            const data = items[key];
                            if (data) {
                                // Create structured data if it's just a string
                                const newData = typeof data === 'string' 
                                    ? {
                                        script: data,
                                        modelUsed: 'gemini-1.5-flash-latest',
                                        timestamp: Date.now(),
                                        completed: true
                                      }
                                    : data;
                                
                                // Save with new key
                                chrome.storage.local.set({ [newKey]: newData }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.error("Error saving fixed key:", chrome.runtime.lastError);
                                    } else {
                                        // Remove old key
                                        chrome.storage.local.remove(key, () => {
                                            if (chrome.runtime.lastError) {
                                                console.error("Error removing old key:", chrome.runtime.lastError);
                                            } else {
                                                console.log(`Successfully migrated ${key} to ${newKey}`);
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    }
                }
            });
        });
    } catch (e) {
        console.error("Error in cleanupStoredTimestamps:", e);
    }
}


document.getElementById('generateScriptButton').addEventListener('click', async () => {
    const steps = await loadRecordedSteps(); // Your existing function to load steps
    const enhancedScript = await enhanceStepsWithAI(steps);
    const outputEl = document.getElementById('robotScriptResult');
    outputEl.value = enhancedScript;
    outputEl.style.display = 'block';
});

document.getElementById('copyScriptButton').addEventListener('click', () => {
    const scriptText = document.getElementById('robotScriptResult').value;
    navigator.clipboard.writeText(scriptText).then(() => {
        alert('Script copied to clipboard!');
    });
});

document.getElementById('downloadScriptButton').addEventListener('click', () => {
    const scriptText = document.getElementById('robotScriptResult').value;
    const blob = new Blob([scriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test.robot';
    a.click();
    URL.revokeObjectURL(url);
});




// Ensure function availability - these are defined later but need to be accessible earlier
// Explicitly making functions globally accessible to prevent "is not defined" errors
window.setupCopyButtons = function(fallback) {
    console.log("Using setupCopyButtons fallback function");
    // Basic fallback implementation
    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            if (value) {
                navigator.clipboard.writeText(value)
                    .then(() => {
                        const originalText = this.textContent;
                        this.textContent = 'Copied!';
                        setTimeout(() => {
                            this.textContent = originalText;
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                    });
            }
        });
    });
};

window.updateXPaths = function(xpaths) {
    console.log("Using updateXPaths fallback function");
    // Store the xpaths for later use
    lastXPaths = xpaths;
};

// Utility function to safely execute functions that might not be defined yet
function safeExecute(funcName, ...args) {
    try {
        if (typeof window[funcName] === 'function') {
            return window[funcName](...args);
        } else {
            console.error(`Function ${funcName} is not defined yet`);
            return null;
        }
    } catch (error) {
        console.error(`Error executing ${funcName}:`, error);
        return null;
    }
}



// document.getElementById('enhanceWithAIButton').addEventListener('click', async () => {
//     chrome.storage.local.get('lockedState', (res) => {
//         const xpathDetails = res.lockedState || {};
//         chrome.runtime.sendMessage({ action: 'generateRobotScriptAI', xpathDetails }, (response) => {
//             if (chrome.runtime.lastError) {
//                 console.error("Messaging error:", chrome.runtime.lastError.message);
//                 alert("Extension messaging failed.");
//                 return;
//             }
//             if (response && response.success) {
//                 document.getElementById('robotScript').value = response.script;
//             } else {
//                 console.error("AI failed:", response?.error);
//                 alert(response?.error || 'Failed to enhance with AI.');
//             }
//         });
//     });
// });


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        console.log("✅ Ping received from popup, responding...");
        sendResponse({ pong: true });
    }
    return true;
});


// Ensure default Gemini API key is stored in chrome.storage
chrome.storage.local.get('geminiApiKey', (data) => {
    if (!data.geminiApiKey) {
        chrome.storage.local.set({
            geminiApiKey: "AIzaSyCGVJbnSHSvgiPbnv5dB1cWEbq2092EvEI"
        }, () => {
            console.log("✅ Default Gemini API key saved.");
        });
    }
});





document.getElementById('enhanceWithAIButton').addEventListener('click', async () => {
    const currentScript = document.getElementById('robotScript').value;

    if (!currentScript.trim()) {
        alert('No script to enhance.');
        return;
    }

    const geminiApiKey = "AIzaSyCGVJbnSHSvgiPbnv5dB1cWEbq2092EvEI";  // ✅ Hardcoded Gemini Key

    const prompt = `
You are an expert Robot Framework Test Automation Engineer. Your task is to take a potentially disorganized, raw Robot Framework script and transform it into a robust, production-ready test suite. You must intelligently analyze the steps, correct their order if illogical, generate meaningful keywords, and add comprehensive validations.

**Input:** A string containing a basic Robot Framework script.

**Your Goal:** Refactor and enhance the original script into a complete, clean, and logical .robot file.

**Key Directives & Logic to Apply:**

1.  **Analyze and Reorder Steps:**
    * Examine the sequence of actions in the \`*** Test Cases ***\` section. If they are illogical (e.g., "Click Button" for submit before "Input Text" for a password), you **MUST** reorder them into a logical flow. A standard login sequence is: \`Open Browser\` -> \`Input Text\` (username) -> \`Input Text\` (password) -> \`Click Button\` (submit).
    * Remove redundant steps, such as clicking an input field right before typing into it.

2.  **Generate Meaningful Keywords:**
    * Do not just leave a long list of steps in the test case. Group logical actions from the original script into new keywords.
    * For a login sequence, create a keyword like \`Log In To Application\`.
    * For a form, create a single, comprehensive keyword like \`Fill Out And Verify Contact Form\`. Avoid creating too many small, single-purpose keywords like "Input Name" or "Select Gender".

3.  **Implement Robust Validations & Waits:**
    * **Implicit Waits:** Before every \`Click Element\`, \`Click Button\`, or \`Input Text\` action, you **MUST** ensure a \`Wait Until Element Is Visible\` keyword exists for that element's locator.
    * **Explicit Assertions:** After critical actions, add validation steps.
        * After a login attempt, validate the outcome. Use \`Wait Until Element Is Visible\` on a dashboard element (e.g., a "Dashboard" header) and then use \`Element Text Should Be\` to verify it.

4.  **Add Conditional Logic (\`Run Keyword If\`):**
    * Use this for validating outcomes that can be either success or failure (e.g., checking for a "Login Successful" message OR an "Invalid Credentials" message).
    * **Example:**
        \`\`\`robot
        \${login_successful}=    Run Keyword And Return Status    Wait Until Element Is Visible    \${DASHBOARD_HEADER}    timeout=5s
        Run Keyword If    '\${login_successful}' == 'True'    Handle Successful Login
        Run Keyword If    '\${login_successful}' == 'False'   Handle Failed Login
        \`\`\`

5.  **Incorporate Screenshots:**
    * **MUST** add or relocate \`Capture Page Screenshot\` keywords to these key moments:
        * Immediately after the page has loaded (\`Open Browser\`).
        * Immediately after filling all form fields, but *before* clicking submit.
        * Immediately after clicking a submit or login button.
        * Immediately before a critical assertion.
    * Use meaningful, numbered filenames, e.g., \`Capture Page Screenshot    filename=01_Login_Page_Loaded.png\`.

6.  **Structure the Robot Framework File:**
    * **\`*** Settings ***\`:** Ensure it contains \`Library    SeleniumLibrary\` and add a clear \`Documentation\` string.
    * **\`*** Variables ***\`:** Identify all locators from the original script and declare them as variables (e.g., \`\${USERNAME_INPUT}    xpath=//input[@name='username']\`). The test steps and keywords **MUST** use these variables.
    * **\`*** Test Cases ***\`:** The test case should be refactored to be clean and readable, primarily calling your generated keywords.
    * **\`*** Keywords ***\`:** This section must contain the detailed implementation of the new keywords you generated.

7.  **Handle Form Elements Correctly:**
    * **Radio Buttons:** The \`Select Radio Button\` keyword takes two arguments: the group \`name\` and the \`value\`. You **MUST** use these as literal strings in the keyword call. **DO NOT** create a locator variable for the radio button group name in the \`*** Variables ***\` section.
        * Correct Keyword Usage: \`Select Radio Button    gender    female\`
        * Correct Variable for a specific option (if needed for a wait): \`\${FEMALE_RADIO_OPTION}    xpath=//input[@value='female']\`
        * Incorrect: \`Select Radio Button    \${GENDER_GROUP_LOCATOR}    female\`
    * **Checkboxes:** Use direct \`Select Checkbox\` calls with a locator variable pointing to the specific checkbox element. Do not use conditional logic like \`Run Keyword If\` for simple checkbox selections.
    * **Dropdowns:** Use \`Select From List By Label\` or \`Select From List By Value\` with a locator variable pointing to the main \`<select>\` element.

**Output Format:**
* Return **ONLY** the raw, enhanced Robot Framework code.
* **DO NOT** use markdown code blocks (e.g., \`\`\`robot ... \`\`\`).
* **DO NOT** add any explanations, introductions, or closing remarks.
* The script should start with \`*** Settings ***\` and end with the last line of your final keyword.
Original Test Script:
${currentScript}

Return ONLY enhanced Robot Framework code.
`.trim();

    chrome.runtime.sendMessage({ 
        action: 'enhanceWithAI', 
        prompt, 
        geminiApiKey // ✅ Send the key explicitly
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Messaging error:", chrome.runtime.lastError.message);
            alert("Extension messaging failed.");
            return;
        }
        if (response && response.success) {
            document.getElementById('robotScript').value = response.aiResponse;
        } else {
            console.error("AI failed:", response?.error);
            alert(response?.error || 'Failed to enhance with AI.');
        }
    });
});




// Save Gemini API key
document.getElementById('saveGeminiApiKey').addEventListener('click', () => {
    const key = document.getElementById('geminiApiKeyInput').value.trim();
    if (!key) {
        alert("Please enter a valid Gemini API key.");
        return;
    }

    chrome.storage.local.set({ geminiApiKey: key }, () => {
        alert("✅ Gemini API Key saved successfully!");
    });
});

// Load key on popup open
chrome.storage.local.get('geminiApiKey', (data) => {
    if (data.geminiApiKey) {
        document.getElementById('geminiApiKeyInput').value = data.geminiApiKey;
    }
});
