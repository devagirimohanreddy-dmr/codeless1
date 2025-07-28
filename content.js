(function () {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const dispatchLocationChange = () => {
    const event = new Event("locationchange");
    window.dispatchEvent(event);
  };

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    dispatchLocationChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    dispatchLocationChange();
  };

  window.addEventListener("popstate", dispatchLocationChange);
})();

// ✅ ENHANCED: Persistent recording state management
window.addEventListener("spa-navigation", function () {
    console.log("🔄 Detected SPA navigation - maintaining recording state");
    maintainRecordingState();
});

// ✅ ENHANCED: Listen for page visibility changes to maintain recording
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        console.log("🔄 Page became visible - checking recording state");
        setTimeout(() => {
            maintainRecordingState();
        }, 100);
    }
});

// ✅ ENHANCED: Listen for focus events to maintain recording
window.addEventListener('focus', function() {
    console.log("🔄 Window focused - checking recording state");
    setTimeout(() => {
        maintainRecordingState();
    }, 100);
});

// ✅ ENHANCED: Persistent recording state maintenance
function maintainRecordingState() {
    chrome.storage.local.get(['isRecording', 'recordedSteps'], (result) => {
        if (result.isRecording) {
            console.log("🎬 Maintaining recording state after navigation/reload");
            
            // Ensure the recording state is properly initialized
            if (!window.advancedXPathInspector?.state) {
                window.advancedXPathInspector = {
                    state: {
                        isRecording: true,
                        recordedSteps: result.recordedSteps || [],
                        isInspectorActive: false,
                        isLocked: false
                    },
                    constants: {
                        HOVER_COLOR: '#4CAF50',
                        LOCKED_COLOR: '#2196F3',
                        HOVER_STYLES: '2px solid #4CAF50',
                        LOCKED_STYLES: '2px solid #2196F3',
                        HOVER_DELAY: 1000
                    }
                };
            } else {
                // Update existing state
                window.advancedXPathInspector.state.isRecording = true;
                window.advancedXPathInspector.state.recordedSteps = result.recordedSteps || [];
            }
            
            // Reattach recording listeners
            detachRecordingListeners(); // Clean up first
            attachRecordingListeners();
            
            console.log("✅ Recording state maintained with", result.recordedSteps?.length || 0, "existing steps");
        } else {
            console.log("🛑 Recording is not active");
        }
    });
}

// Call recording logic on first load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded - initializing recording system');
    maintainRecordingState();
    initializeRecording();
    // ✅ ENHANCED: Initialize persistent recording system
    initializePersistentRecording();
});

// ✅ ENHANCED: Also check on window load for additional safety
window.addEventListener('load', () => {
    console.log('🚀 Window loaded - double-checking recording state');
    setTimeout(() => {
        maintainRecordingState();
        // ✅ ENHANCED: Ensure persistent system is running
        if (!dynamicContentObserver) {
            initializePersistentRecording();
        }
    }, 500);
});

console.log("✅ Content script injected on", window.location.href);
let inputTimeouts = {};

function initializeRecording() {
    console.log("🧠 Reinitializing recording + inspection");

    cleanupEventListeners();
    detachRecordingListeners();

    if (!window.advancedXPathInspector?.state) {
        window.advancedXPathInspector = {
            state: {
                isRecording: false,
                recordedSteps: [],
                isInspectorActive: false,
                isLocked: false
            },
            constants: {
                HOVER_COLOR: '#4CAF50',
                LOCKED_COLOR: '#2196F3',
                HOVER_STYLES: '2px solid #4CAF50',
                LOCKED_STYLES: '2px solid #2196F3',
                HOVER_DELAY: 1000
            }

        
        };
    }

    attachRecordingListeners();

    // ✅ ENHANCED: More robust recording state restoration with recovery
    chrome.storage.local.get(['isRecording', 'recordedSteps'], ({ isRecording, recordedSteps }) => {
        if (isRecording) {
            window.advancedXPathInspector.state.isRecording = true;
            window.advancedXPathInspector.state.recordedSteps = recordedSteps || [];
            
            // Ensure listeners are attached
            if (!window._recordingListenersAttached) {
                attachRecordingListeners();
            }
            
            // ✅ ENHANCED: Set up recovery mechanism
            createRecordingRecoveryMechanism();
            
            console.log("✅ Recording resumed after initialization with", recordedSteps?.length || 0, "steps");
        } else {
            // ✅ ENHANCED: Check for recovery from sessionStorage
            try {
                const sessionRecording = sessionStorage.getItem('xpathRecorderActive');
                const sessionSteps = sessionStorage.getItem('xpathRecorderSteps');
                
                if (sessionRecording === 'true' && sessionSteps) {
                    console.log('🔄 Recovering recording state from sessionStorage');
                    const recoveredSteps = JSON.parse(sessionSteps);
                    
                    // Restore recording state
                    window.advancedXPathInspector.state.isRecording = true;
                    window.advancedXPathInspector.state.recordedSteps = recoveredSteps;
                    
                    // Update chrome storage
                    chrome.storage.local.set({ 
                        isRecording: true, 
                        recordedSteps: recoveredSteps 
                    });
                    
                    // Attach listeners
                    attachRecordingListeners();
                    
                    console.log(`✅ Recovered recording with ${recoveredSteps.length} steps`);
                }
            } catch (e) {
                console.warn('Could not recover from sessionStorage:', e);
            }
        }
    });

    // ✅ ENHANCED: Handle select elements more robustly with dynamic detection
    const initializeSelectElements = () => {
        document.querySelectorAll('select:not([data-recording-initialized])').forEach(select => {
            select.setAttribute('data-recording-initialized', 'true');
            select.addEventListener('change', (e) => {
                if (!window.advancedXPathInspector?.state?.isRecording) return;

                const el = e.target;
                const selectedOption = el.options[el.selectedIndex];
                const value = selectedOption?.text || selectedOption?.value || '';

                const allPossibleXPaths = getAllXPaths(el);
                const xpath = getReliableXPath(allPossibleXPaths);
                if (!xpath) {
                    console.warn('Could not generate XPath for select element:', el);
                    return;
                }

                const step = {
                    type: 'dropdown',
                    xpath: `xpath=${xpath}`,
                    tag: el.tagName.toLowerCase(),
                    value,
                    timestamp: Date.now(),
                    elementInfo: allPossibleXPaths.elementInfo,
                    allXPaths: allPossibleXPaths
                };

                window.advancedXPathInspector.state.recordedSteps.push(step);
                saveStepsToStorage();
                console.log('✅ Recorded select change:', step);
            }, true);
        });
    };

    // ✅ ENHANCED: Handle radio buttons more robustly with dynamic detection
    const initializeRadioElements = () => {
        document.querySelectorAll('input[type=radio]:not([data-recording-initialized])').forEach(radio => {
            radio.setAttribute('data-recording-initialized', 'true');
            radio.addEventListener('click', (e) => {
                if (!window.advancedXPathInspector?.state?.isRecording) return;

                const el = e.target;
                const allPossibleXPaths = getAllXPaths(el);
                const xpath = getReliableXPath(allPossibleXPaths);
                if (!xpath) {
                    console.warn('Could not generate XPath for radio element:', el);
                    return;
                }

                const step = {
                    type: 'radio',
                    xpath: `xpath=${xpath}`,
                    tag: el.tagName.toLowerCase(),
                    name: el.name || '',
                    value: el.value || el.getAttribute('aria-label') || el.getAttribute('label'),
                    timestamp: Date.now(),
                    elementInfo: allPossibleXPaths.elementInfo,
                    allXPaths: allPossibleXPaths
                };

                window.advancedXPathInspector.state.recordedSteps.push(step);
                saveStepsToStorage();
                console.log('✅ Recorded radio button click:', step);
            }, true);
        });
    };
    
    // Initialize existing elements
    initializeSelectElements();
    initializeRadioElements();
    
    // ✅ ENHANCED: Set up periodic re-initialization for dynamic content
    setInterval(() => {
        if (window.advancedXPathInspector?.state?.isRecording) {
            initializeSelectElements();
            initializeRadioElements();
        }
    }, 3000); // Check every 3 seconds for new elements
}

chrome.storage.local.get(['isRecording'], ({ isRecording }) => {
    if (isRecording) {
        if (!window.advancedXPathInspector?.state) {
            window.advancedXPathInspector = { state: {} };
        }
        window.advancedXPathInspector.state.isRecording = true;
        console.log('✅ Recording reattached after navigation.');
        attachRecordingListeners();
    }
});

// Check if script is already initialized
if (window.advancedXPathInspector) {
    console.log('XPath Inspector already initialized');
    // Try to clean up old state if it exists
    try {
        const { state } = window.advancedXPathInspector;
        if (state.hoveredElement) {
            state.hoveredElement.style.outline = '';
        }
        state.hoveredElement = null;
        state.isLocked = false;
        state.isInspectorActive = false;
        state.isInitialized = false;
        document.body.style.cursor = '';
    } catch (error) {
        console.log('Error cleaning up old state:', error);
    }
}

// Create namespace for our extension with recovery mechanism
window.advancedXPathInspector = {
    state: {
        hoveredElement: null,
        isInspectorActive: false,
        isLocked: false,
        isInitialized: false,
        hoverTimer: null,
        isRecording: false,
        recordedSteps: []

    },
    constants: {
        HOVER_COLOR: '#4CAF50',
        LOCKED_COLOR: '#2196F3',
        HOVER_STYLES: '2px solid #4CAF50',
        LOCKED_STYLES: '2px solid #2196F3',
        HOVER_DELAY: 1000 // 1 second delay before auto-lock
    }
};

// Function to wait for page to be fully loaded
function waitForPageLoad() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve);
        }
    });
}

// Function to initialize the inspector
async function initializeInspector() {
    const { state } = window.advancedXPathInspector;
    
    if (state.isInitialized) {
        cleanupEventListeners();
    }
    
    try {
        await waitForPageLoad();
        
        // Setup event listeners
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('mouseout', handleMouseOut, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('contextmenu', handleRightClick, true);
        document.addEventListener('keydown', handleKeyDown, true);

        state.isInitialized = true;
        console.log('Inspector initialized');
        return true;
    } catch (error) {
        console.log('Initialization error:', error);
        return false;
    }
}

if (!window.advancedXPathInspector) {
    window.advancedXPathInspector = {
        state: {
            isInspectorActive: false,
            isRecording: false,
            recordedSteps: []
        }
    };
}

//🧠 Restore recordedSteps from chrome.storage.local
chrome.storage.local.get(['recordedSteps'], (result) => {
    window.advancedXPathInspector.state.recordedSteps = result.recordedSteps || [];
    console.log('🧩 Restored steps after page load:', result.recordedSteps);
});

// Function to cleanup event listeners
function cleanupEventListeners() {
    try {
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('mouseout', handleMouseOut, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('contextmenu', handleRightClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
    } catch (error) {
        console.log('Error cleaning up event listeners:', error);
    }
}

function attachRecordingListeners() {
    if (window._recordingListenersAttached) return;
    
    // ✅ ENHANCED: Core interaction events
    document.addEventListener('click', handleRecordedClick, true);
    document.addEventListener('input', handleRecordedInput, true);
    document.addEventListener('change', handleRecordedChange, true);
    document.addEventListener('keydown', handleRecordedKeyDown, true);
    
    // ✅ ENHANCED: Additional interaction events for comprehensive recording
    document.addEventListener('dblclick', handleRecordedDoubleClick, true);
    document.addEventListener('contextmenu', handleRecordedRightClick, true);
    document.addEventListener('focus', handleRecordedFocus, true);
    document.addEventListener('blur', handleRecordedBlur, true);
    document.addEventListener('submit', handleRecordedSubmit, true);
    document.addEventListener('reset', handleRecordedReset, true);
    
    // ✅ ENHANCED: Mouse events for drag and drop and hover interactions
    document.addEventListener('mousedown', handleRecordedMouseDown, true);
    document.addEventListener('mouseup', handleRecordedMouseUp, true);
    document.addEventListener('mouseover', handleRecordedMouseOver, true);
    document.addEventListener('mouseout', handleRecordedMouseOut, true);
    
    // ✅ ENHANCED: Drag and drop events
    document.addEventListener('dragstart', handleRecordedDragStart, true);
    document.addEventListener('dragend', handleRecordedDragEnd, true);
    document.addEventListener('drop', handleRecordedDrop, true);
    
    // ✅ ENHANCED: Touch events for mobile compatibility
    document.addEventListener('touchstart', handleRecordedTouchStart, true);
    document.addEventListener('touchend', handleRecordedTouchEnd, true);
    
    // ✅ ENHANCED: Scroll events
    document.addEventListener('scroll', handleRecordedScroll, true);
    
    window._recordingListenersAttached = true;
    console.log('🎙️ Enhanced recording listeners attached');
}

function detachRecordingListeners() {
    // ✅ ENHANCED: Remove all event listeners
    document.removeEventListener('click', handleRecordedClick, true);
    document.removeEventListener('input', handleRecordedInput, true);
    document.removeEventListener('change', handleRecordedChange, true);
    document.removeEventListener('keydown', handleRecordedKeyDown, true);
    document.removeEventListener('dblclick', handleRecordedDoubleClick, true);
    document.removeEventListener('contextmenu', handleRecordedRightClick, true);
    document.removeEventListener('focus', handleRecordedFocus, true);
    document.removeEventListener('blur', handleRecordedBlur, true);
    document.removeEventListener('submit', handleRecordedSubmit, true);
    document.removeEventListener('reset', handleRecordedReset, true);
    document.removeEventListener('mousedown', handleRecordedMouseDown, true);
    document.removeEventListener('mouseup', handleRecordedMouseUp, true);
    document.removeEventListener('mouseover', handleRecordedMouseOver, true);
    document.removeEventListener('mouseout', handleRecordedMouseOut, true);
    document.removeEventListener('dragstart', handleRecordedDragStart, true);
    document.removeEventListener('dragend', handleRecordedDragEnd, true);
    document.removeEventListener('drop', handleRecordedDrop, true);
    document.removeEventListener('touchstart', handleRecordedTouchStart, true);
    document.removeEventListener('touchend', handleRecordedTouchEnd, true);
    document.removeEventListener('scroll', handleRecordedScroll, true);
    
    window._recordingListenersAttached = false;
    console.log('🛑 Enhanced recording listeners detached');
}

// Function to lock current element
function lockElement(element) {
    const { state, constants } = window.advancedXPathInspector;
    
    if (!element || !state.isInspectorActive) return;
    
    console.log("Locking element:", element);
    
    // Clear any existing hover timer
    if (state.hoverTimer) {
        clearTimeout(state.hoverTimer);
        state.hoverTimer = null;
    }
    
    // Update state and apply style
    state.isLocked = true;
    state.hoveredElement = element;
    element.style.outline = constants.LOCKED_STYLES;
    
    // Generate XPaths and notify popup with complete element info
    console.log("Generating XPaths for element:", element);
    const xpaths = getAllXPaths(element);
    console.log("Generated XPaths:", xpaths);
    
    if (xpaths) {
        // Store state
        chrome.storage.local.set({
            lockedState: {
                isLocked: true,
                xpaths: xpaths,
                timestamp: Date.now()
            }
        });

        // Get additional properties for Robot Framework
        const elementInfo = {
                tagName: element.tagName.toLowerCase(),
                id: element.id || '',
                className: element.className || '',
                type: element.getAttribute('type') || '',
                name: element.getAttribute('name') || '',
                value: element.getAttribute('value') || '',
                placeholder: element.getAttribute('placeholder') || '',
                text: element.textContent.trim(),
            role: element.getAttribute('role') || '',
            // Additional properties for Robot Framework
            href: element.getAttribute('href') || '',
            src: element.getAttribute('src') || '',
            alt: element.getAttribute('alt') || '',
            title: element.getAttribute('title') || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            dataTestId: element.getAttribute('data-testid') || element.getAttribute('data-test-id') || '',
            // Get computed properties
            isVisible: isElementVisible(element),
            isEnabled: !element.disabled,
            isChecked: element.checked,
            boundingRect: element.getBoundingClientRect(),
            xpath: getElementXPath(element)
        };

        // Send complete information to popup
        console.log("Sending XPaths to popup:", xpaths);
        safeSendMessage({
            action: 'updateXPaths',
            xpaths: xpaths,
            isLocked: true,
            elementInfo: elementInfo
        });
    } else {
        console.error("Failed to generate XPaths for element:", element);
    }
}

// Helper function to check if element is visible
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// Function to unlock current element
function unlockElement() {
    const { state } = window.advancedXPathInspector;
    
    if (state.hoveredElement) {
        state.hoveredElement.style.outline = '';
    }
    
    state.hoveredElement = null;
    state.isLocked = false;
    
    if (state.hoverTimer) {
        clearTimeout(state.hoverTimer);
        state.hoverTimer = null;
    }
    
    // Clear storage
    chrome.storage.local.remove('lockedState');
    
    // Update popup
    safeSendMessage({
        action: 'updateLockStatus',
        isLocked: false
    });
}

// Handle mouse hover
function handleMouseOver(event) {
    const { state, constants } = window.advancedXPathInspector;
    if (!state.isInspectorActive || state.isLocked) return;
    
    // Clear any existing hover timer
    if (state.hoverTimer) {
        clearTimeout(state.hoverTimer);
        state.hoverTimer = null;
    }
    
    // Clear previous element outline
    if (state.hoveredElement && state.hoveredElement !== event.target) {
        state.hoveredElement.style.outline = '';
    }
    
    // Update current element
    state.hoveredElement = event.target;
    state.hoveredElement.style.outline = constants.HOVER_STYLES;
    
    // Set timer for auto-lock
    state.hoverTimer = setTimeout(() => {
        if (state.hoveredElement === event.target && !state.isLocked) {
            lockElement(event.target);
        }
    }, constants.HOVER_DELAY);
}

// Handle mouse out
function handleMouseOut(event) {
    const { state } = window.advancedXPathInspector;
    if (!state.isInspectorActive || state.isLocked) return;
    
    // Clear hover timer
    if (state.hoverTimer) {
        clearTimeout(state.hoverTimer);
        state.hoverTimer = null;
    }
    
    // Clear outline if not locked
    if (!state.isLocked && state.hoveredElement) {
        state.hoveredElement.style.outline = '';
        state.hoveredElement = null;
    }
}

// Handle keyboard shortcuts
function handleKeyDown(event) {
    const { state } = window.advancedXPathInspector;
    if (!state.isInspectorActive) return;
    
    // If element is locked, any key will unlock it (except for modifier keys)
    if (state.isLocked && 
        !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        unlockElement();
        return;
    }
    
    // Handle Escape key to stop inspection
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        unlockElement();
        state.isInspectorActive = false;
        document.body.style.cursor = '';
        safeSendMessage({
            action: 'inspectorDeactivated'
        });
    }

    // Handle 'C' key to clear highlights
    if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        clearHighlights();
        safeSendMessage({
            action: 'highlightsCleared'
        });
    }
}

// Function to safely send messages to popup
function safeSendMessage(message) {
    try {
        chrome.runtime.sendMessage(message, function(response) {
            if (chrome.runtime.lastError) {
                console.log('Error sending message:', chrome.runtime.lastError.message);
                return;
            }
            // Handle successful response if needed
            if (response) {
                console.log('Message sent successfully:', message.action);
            }
        });
    } catch (error) {
        console.log('Exception in safeSendMessage:', error);
    }
}

// Handle click
function handleClick(event) {
    const { state } = window.advancedXPathInspector;
    if (!state.isInspectorActive) return;

    // Only handle left clicks
    if (event.button !== 0) return;
    
    if (state.isLocked) {
        event.preventDefault();
        event.stopPropagation();
        unlockElement();
    }
}

// ✅ ENHANCED: Robust step storage with error handling and backup
function saveStepsToStorage() {
    if (!window.advancedXPathInspector?.state?.recordedSteps) {
        console.warn('No recorded steps to save');
        return;
    }
    
    const steps = window.advancedXPathInspector.state.recordedSteps;
    const timestamp = Date.now();
    
    // Save to primary storage
    chrome.storage.local.set({ 
        recordedSteps: steps,
        lastSaved: timestamp,
        stepCount: steps.length
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving steps to storage:', chrome.runtime.lastError);
        } else {
            console.log(`💾 Saved ${steps.length} steps to storage`);
        }
    });
    
    // ✅ ENHANCED: Create backup with timestamp for recovery
    chrome.storage.local.set({
        [`recordedSteps_backup_${timestamp}`]: steps
    }, () => {
        if (chrome.runtime.lastError) {
            console.warn('Could not create backup:', chrome.runtime.lastError);
        }
    });
    
    // ✅ ENHANCED: Clean up old backups (keep only last 5)
    chrome.storage.local.get(null, (allData) => {
        const backupKeys = Object.keys(allData).filter(key => key.startsWith('recordedSteps_backup_'));
        if (backupKeys.length > 5) {
            const sortedKeys = backupKeys.sort().reverse(); // Most recent first
            const keysToRemove = sortedKeys.slice(5); // Remove all but the 5 most recent
            
            keysToRemove.forEach(key => {
                chrome.storage.local.remove(key);
            });
            
            console.log(`🧹 Cleaned up ${keysToRemove.length} old backups`);
        }
    });
}

// ✅ ENHANCED: Mutation observer to handle dynamic content
let dynamicContentObserver = null;

function setupDynamicContentObserver() {
    // Clean up existing observer
    if (dynamicContentObserver) {
        dynamicContentObserver.disconnect();
    }
    
    dynamicContentObserver = new MutationObserver((mutations) => {
        let shouldReinitialize = false;
        
        mutations.forEach((mutation) => {
            // Check if new form elements were added
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const hasFormElements = node.matches && (
                            node.matches('input, select, textarea, button') ||
                            node.querySelector('input, select, textarea, button')
                        );
                        
                        if (hasFormElements) {
                            shouldReinitialize = true;
                        }
                    }
                });
            }
        });
        
        // Reinitialize recording for new elements if needed
        if (shouldReinitialize && window.advancedXPathInspector?.state?.isRecording) {
            console.log('🔄 New form elements detected - reinitializing recording');
            setTimeout(() => {
                initializeDynamicElements();
            }, 100);
        }
    });
    
    // Start observing
    dynamicContentObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });
    
    console.log('👁️ Dynamic content observer started');
}

// ✅ ENHANCED: Initialize recording for dynamically added elements
function initializeDynamicElements() {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    // Handle dynamically added select elements
    document.querySelectorAll('select:not([data-recording-initialized])').forEach(select => {
        select.setAttribute('data-recording-initialized', 'true');
        select.addEventListener('change', (e) => {
            if (!window.advancedXPathInspector?.state?.isRecording) return;

            const el = e.target;
            const selectedOption = el.options[el.selectedIndex];
            const value = selectedOption?.text || selectedOption?.value || '';

            const allPossibleXPaths = getAllXPaths(el);
            const xpath = getReliableXPath(allPossibleXPaths);
            if (!xpath) {
                console.warn('Could not generate XPath for dynamic select element:', el);
                return;
            }

            const step = {
                type: 'dropdown',
                xpath: `xpath=${xpath}`,
                tag: el.tagName.toLowerCase(),
                value,
                timestamp: Date.now(),
                elementInfo: allPossibleXPaths.elementInfo,
                allXPaths: allPossibleXPaths,
                isDynamic: true // Mark as dynamically added
            };

            window.advancedXPathInspector.state.recordedSteps.push(step);
            saveStepsToStorage();
            console.log('✅ Recorded dynamic select change:', step);
        }, true);
    });

    // Handle dynamically added radio buttons
    document.querySelectorAll('input[type=radio]:not([data-recording-initialized])').forEach(radio => {
        radio.setAttribute('data-recording-initialized', 'true');
        radio.addEventListener('click', (e) => {
            if (!window.advancedXPathInspector?.state?.isRecording) return;

            const el = e.target;
            const allPossibleXPaths = getAllXPaths(el);
            const xpath = getReliableXPath(allPossibleXPaths);
            if (!xpath) {
                console.warn('Could not generate XPath for dynamic radio element:', el);
                return;
            }

            const step = {
                type: 'radio',
                xpath: `xpath=${xpath}`,
                tag: el.tagName.toLowerCase(),
                name: el.name || '',
                value: el.value || el.getAttribute('aria-label') || el.getAttribute('label'),
                timestamp: Date.now(),
                elementInfo: allPossibleXPaths.elementInfo,
                allXPaths: allPossibleXPaths,
                isDynamic: true // Mark as dynamically added
            };

            window.advancedXPathInspector.state.recordedSteps.push(step);
            saveStepsToStorage();
            console.log('✅ Recorded dynamic radio button click:', step);
        }, true);
    });
    
    // Handle other dynamically added form elements
    document.querySelectorAll('input:not([type=radio]):not([data-recording-initialized]), textarea:not([data-recording-initialized])').forEach(element => {
        element.setAttribute('data-recording-initialized', 'true');
        console.log('🆕 Initialized recording for dynamic element:', element.tagName.toLowerCase());
    });
}

// ✅ ENHANCED: Periodic recording state check
function startPeriodicRecordingCheck() {
    setInterval(() => {
        chrome.storage.local.get(['isRecording'], (result) => {
            if (result.isRecording && !window.advancedXPathInspector?.state?.isRecording) {
                console.log('🔄 Recording state mismatch detected - fixing');
                maintainRecordingState();
            } else if (!result.isRecording && window.advancedXPathInspector?.state?.isRecording) {
                console.log('🛑 Recording stopped externally - updating state');
                window.advancedXPathInspector.state.isRecording = false;
                detachRecordingListeners();
            }
        });
    }, 2000); // Check every 2 seconds
}

// ✅ ENHANCED: Recovery mechanism for lost recording state
function createRecordingRecoveryMechanism() {
    // Store recording state in multiple places for redundancy
    if (window.advancedXPathInspector?.state?.isRecording) {
        // Use sessionStorage as backup
        try {
            sessionStorage.setItem('xpathRecorderActive', 'true');
            sessionStorage.setItem('xpathRecorderSteps', JSON.stringify(window.advancedXPathInspector.state.recordedSteps || []));
        } catch (e) {
            console.warn('Could not use sessionStorage for backup:', e);
        }
        
        // Use a custom property on window for immediate access
        window._xpathRecorderState = {
            isRecording: true,
            steps: window.advancedXPathInspector.state.recordedSteps || [],
            lastUpdate: Date.now()
        };
    }
}

// ✅ ENHANCED: Initialize all persistence mechanisms
function initializePersistentRecording() {
    console.log('🚀 Initializing persistent recording system');
    
    // Set up dynamic content observer
    setupDynamicContentObserver();
    
    // Start periodic checks
    startPeriodicRecordingCheck();
    
    // Create recovery mechanism
    createRecordingRecoveryMechanism();
    
    // Initialize dynamic elements that might already exist
    setTimeout(() => {
        initializeDynamicElements();
    }, 500);
    
    console.log('✅ Persistent recording system initialized');
}

function getSmartLocator(el) {
    if (!el || !el.tagName) return '';

    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    const name = el.getAttribute('name');
    const placeholder = el.getAttribute('placeholder');
    const aria = el.getAttribute('aria-label');
    const type = el.getAttribute('type');
    const role = el.getAttribute('role');
    const text = el.textContent?.trim();

    if (id) return `xpath=//${tag}[@id="${id}"]`;
    if (placeholder) return `xpath=//${tag}[@placeholder="${placeholder}"]`;
    if (aria) return `xpath=//${tag}[@aria-label="${aria}"]`;
    if (name && type) return `xpath=//${tag}[@name="${name}" and @type="${type}"]`;
    if (name) return `xpath=//${tag}[@name="${name}"]`;
    if (role && text) return `xpath=//${tag}[@role="${role}" and contains(text(), "${text}")]`;
    if (tag === 'button' && text) return `xpath=//button[text()="${text}"]`;

    // ✅ Fallback with sibling index to avoid //input[1]
    const siblings = Array.from(el.parentNode.children).filter(s => s.tagName?.toLowerCase() === tag);
    const index = siblings.indexOf(el) + 1;
    return `xpath=//${tag}[${index}]`;
}

function extractXpath(x) {
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (typeof x === 'object' && x.xpath) return String(x.xpath);
    return '';
}

// Store a timer per field to debounce
const inputDebounceTimers = {};

// Helper to get a stable XPath for an element, specifically for debouncing/filtering
// This XPath should NOT depend on changing attributes like 'value'.
function getStableXPathForElement(el) {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    const name = el.getAttribute('name');
    const placeholder = el.getAttribute('placeholder');
    const aria = el.getAttribute('aria-label');
    const type = el.getAttribute('type'); // useful for inputs where type is constant
    const role = el.getAttribute('role');

    if (id) return `//${tag}[@id="${id}"]`;
    if (name && type) return `//${tag}[@name="${name}" and @type="${type}"]`;
    if (name) return `//${tag}[@name="${name}"]`;
    if (placeholder) return `//${tag}[@placeholder="${placeholder}"]`;
    if (aria) return `//${tag}[@aria-label="${aria}"]`;
    if (role) return `//${tag}[@role="${role}"]`; // Might not be unique, but stable

    // Fallback to absolute XPath if no stable attributes found
    return getAbsoluteXPath(el); // getAbsoluteXPath does not use changing attributes
}

// ✅ ADD MISSING getReliableXPath FUNCTION
function getReliableXPath(allPossibleXPaths) {
    if (!allPossibleXPaths) return '';
    
    // Priority order: uniqueXPaths > formXPaths > specializedXPaths > category-based XPaths
    if (allPossibleXPaths.uniqueXPaths && allPossibleXPaths.uniqueXPaths.length > 0) {
        return allPossibleXPaths.uniqueXPaths[0].xpath;
    }
    
    if (allPossibleXPaths.formXPaths && allPossibleXPaths.formXPaths.length > 0) {
        return allPossibleXPaths.formXPaths[0].xpath;
    }
    
    if (allPossibleXPaths.specializedXPaths && allPossibleXPaths.specializedXPaths.length > 0) {
        return allPossibleXPaths.specializedXPaths[0].xpath;
    }
    
    // Try category-based XPaths in priority order
    const categories = [
        'classBased', 'roleBased', 'textValue', 'classRoleText', 
        'parentContext', 'verticalRelative', 'horizontalRelative', 'nearRelative'
    ];
    
    for (const category of categories) {
        if (allPossibleXPaths.xpaths && 
            allPossibleXPaths.xpaths[category] && 
            allPossibleXPaths.xpaths[category].length > 0) {
            return allPossibleXPaths.xpaths[category][0].xpath;
        }
    }
    
    // Fallback to basic XPath from elementInfo
    if (allPossibleXPaths.elementInfo && allPossibleXPaths.elementInfo.xpath) {
        return allPossibleXPaths.elementInfo.xpath;
    }
    
    return '';
}

// ✅ ENHANCED handleRecordedClick with better element type detection
function handleRecordedClick(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;

    const el = event.target;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    const role = el.getAttribute('role');
    const classList = Array.from(el.classList || []);
    
    // Get comprehensive XPath collection
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath || reliableXpath.includes('[object Object]')) {
        console.warn('Could not generate reliable XPath for element:', el);
        return;
    }

    const step = {
        type: '',
        xpath: `xpath=${reliableXpath}`,
        tag,
        inputType: type || '',
        timestamp: Date.now(),
        name: el.name || '',
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths // ✅ Store ALL XPaths for better analysis
    };

    // ✅ ENHANCED type-specific detection with more element types
    if (tag === 'input') {
        switch (type) {
            case 'radio':
                step.type = 'radio';
                step.value = el.value || el.getAttribute('aria-label') || el.getAttribute('label');
                break;
            case 'checkbox':
                step.type = 'checkbox';
                step.value = el.checked ? 'Checked' : 'Unchecked';
                break;
            case 'submit':
                step.type = 'submit';
                step.value = el.value || 'Submit';
                break;
            case 'button':
                step.type = 'button';
                step.value = el.value || el.textContent.trim();
                break;
            case 'file':
                step.type = 'file_upload';
                step.value = 'File Upload';
                break;
            case 'range':
                step.type = 'slider';
                step.value = el.value || el.getAttribute('value') || '';
                break;
            case 'color':
                step.type = 'color_picker';
                step.value = el.value || '';
                break;
            case 'date':
            case 'datetime-local':
            case 'time':
                step.type = 'date_time';
                step.value = el.value || '';
                break;
            default:
                // For text, email, password, number, etc.
                step.type = 'input_click';
                step.value = '';
        }
    } else if (tag === 'button') {
        step.type = 'button';
        step.value = el.textContent.trim() || el.value || el.getAttribute('aria-label') || '';
    } else if (tag === 'select') {
        step.type = 'dropdown';
        const selectedOption = el.options[el.selectedIndex];
        step.value = selectedOption?.text || selectedOption?.value || '';
    } else if (tag === 'textarea') {
        step.type = 'textarea_click';
        step.value = '';
    } else if (tag === 'a') {
        step.type = 'link';
        step.value = el.textContent.trim() || el.getAttribute('href') || '';
    } else if (tag === 'img') {
        step.type = 'image';
        step.value = el.getAttribute('alt') || el.getAttribute('title') || '';
    } else if (tag === 'span' || tag === 'div') {
        // Check for special interactive elements
        if (classList.includes('oxd-switch-input') || role === 'switch') {
            step.type = 'toggle';
            step.value = el.getAttribute('aria-checked') === 'true' ? 'On' : 'Off';
        } else if (role === 'button' || classList.some(cls => cls.includes('button') || cls.includes('btn'))) {
            step.type = 'button';
            step.value = el.textContent.trim() || el.getAttribute('aria-label') || '';
        } else if (role === 'tab') {
            step.type = 'tab';
            step.value = el.textContent.trim() || el.getAttribute('aria-label') || '';
        } else if (role === 'menuitem') {
            step.type = 'menu_item';
            step.value = el.textContent.trim() || '';
        } else {
            step.type = 'click';
            step.value = el.textContent.trim() || '';
        }
    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        step.type = 'heading';
        step.value = el.textContent.trim();
    } else if (tag === 'p') {
        step.type = 'paragraph';
        step.value = el.textContent.trim();
    } else if (['ul', 'ol', 'li'].includes(tag)) {
        step.type = 'list_item';
        step.value = el.textContent.trim();
    } else if (tag === 'table' || tag === 'tr' || tag === 'td' || tag === 'th') {
        step.type = 'table_element';
        step.value = el.textContent.trim();
    } else if (role) {
        // Handle ARIA roles
        step.type = `aria_${role}`;
        step.value = el.textContent.trim() || el.getAttribute('aria-label') || '';
    } else {
        step.type = 'click';
        step.value = el.textContent.trim() || '';
    }

    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded enhanced click step:', step);
}

function handleSelectChange(e) {
  if (!window.advancedXPathInspector?.state?.isRecording) return;

  const el = e.target;
  const selectedOption = el.options[el.selectedIndex];
  const value = selectedOption?.text || selectedOption?.value || '';
  const selectedIndex = el.selectedIndex;

  const allPossibleXPaths = getAllXPaths(el);
  const xpath = getReliableXPath(allPossibleXPaths);
  
  if (!xpath) {
    console.warn('Could not generate XPath for select element:', el);
    return;
  }

  const step = {
    type: 'dropdown',
    xpath: `xpath=${xpath}`,
    tag: el.tagName.toLowerCase(),
    value,
    selectedIndex,
    optionCount: el.options.length,
    timestamp: Date.now(),
    elementInfo: allPossibleXPaths.elementInfo,
    allXPaths: allPossibleXPaths, // ✅ Store ALL XPaths
    // ✅ Additional select-specific information
    multiple: el.multiple || false,
    size: el.size || 1,
    allOptions: Array.from(el.options).map(opt => ({
      text: opt.text,
      value: opt.value,
      selected: opt.selected
    }))
  };

  window.advancedXPathInspector.state.recordedSteps.push(step);
  saveStepsToStorage();
  console.log('✅ Enhanced dropdown step:', step);
}

function handleRecordedInput(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;

    const target = event.target;
    const type = target.getAttribute('type');

    // ✅ Skip recording input for non-text inputs (handled by click/change)
    if (type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button') return;

    const allPossibleXPaths = getAllXPaths(target);
    let reliableXpathForStep = getReliableXPath(allPossibleXPaths); // Use the new function
    let stableXPathForDebounce = getStableXPathForElement(target); // This XPath is for debouncing/filtering

    // Fallback if getReliableXPath returns empty
    if (!reliableXpathForStep) {
        reliableXpathForStep = getSmartLocator(target).replace('xpath=', ''); // Last resort for step
    }

    reliableXpathForStep = String(reliableXpathForStep).trim();
    if (!reliableXpathForStep) {
        console.warn('Could not generate XPath for input element:', target);
        return;
    }

    const stepXpath = `xpath=${reliableXpathForStep}`; // Prefix for the actual step

    // Use the stable XPath for debouncing/filtering
    const debounceKey = stableXPathForDebounce;

    if (inputDebounceTimers[debounceKey]) {
        clearTimeout(inputDebounceTimers[debounceKey]);
    }

    inputDebounceTimers[debounceKey] = setTimeout(() => {
        const value = target.value;
        const placeholder = target.getAttribute('placeholder') || '';
        const maxLength = target.getAttribute('maxlength') || '';

        // Remove previous input step for the same *stable element*
        window.advancedXPathInspector.state.recordedSteps = window.advancedXPathInspector.state.recordedSteps.filter(
            s => !(s.type === 'input' && s.stableXPathForDebounce === debounceKey) // Use the new stableXPathForDebounce for filtering
        );

        const step = {
            type: 'input',
            xpath: stepXpath, // Use the more reliable XPath for the step
            value,
            tag: target.tagName.toLowerCase(),
            inputType: type || 'text',
            placeholder,
            maxLength,
            timestamp: Date.now(),
            stableXPathForDebounce: debounceKey, // Store the stable XPath for future filtering
            elementInfo: allPossibleXPaths.elementInfo,
            allXPaths: allPossibleXPaths // ✅ Store ALL XPaths for comprehensive analysis
        };

        window.advancedXPathInspector.state.recordedSteps.push(step);
        saveStepsToStorage();

        console.log('📝 Enhanced debounced input step:', step);

        delete inputDebounceTimers[debounceKey];
    }, 800);
}

function handleRadioClick(e) {
  if (!window.advancedXPathInspector?.state?.isRecording) return;

  const el = e.target;
  const value = el.value || el.getAttribute('aria-label') || '';
  const name = el.name || el.getAttribute('name') || '';
  const allPossibleXPaths = getAllXPaths(el);
  const xpath = getReliableXPath(allPossibleXPaths);
  
  if (!xpath) {
    console.warn('Could not generate XPath for radio element:', el);
    return;
  }

  // ✅ Get all radio buttons with the same name for context
  const radioGroup = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  const radioOptions = Array.from(radioGroup).map(radio => ({
    value: radio.value,
    checked: radio.checked,
    label: radio.getAttribute('aria-label') || radio.getAttribute('label') || ''
  }));

  const step = {
    type: 'radio',
    xpath: `xpath=${xpath}`,
    name,
    value,
    tag: el.tagName.toLowerCase(),
    timestamp: Date.now(),
    elementInfo: allPossibleXPaths.elementInfo,
    allXPaths: allPossibleXPaths, // ✅ Store ALL XPaths
    // ✅ Additional radio-specific information
    radioGroup: radioOptions,
    groupSize: radioGroup.length
  };

  window.advancedXPathInspector.state.recordedSteps.push(step);
  saveStepsToStorage();
  console.log('✅ Enhanced radio button step:', step);
}

function handleRecordedKeyDown(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;

    // Record more key events, not just Enter
    const recordableKeys = ['Enter', 'Tab', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    
    if (recordableKeys.includes(event.key)) {
        const target = event.target;
        const allPossibleXPaths = getAllXPaths(target);
        let reliableXpath = getReliableXPath(allPossibleXPaths);

        // Fallback XPath generation
        if (!reliableXpath) {
            reliableXpath = getSmartLocator(target).replace('xpath=', '');
        }

        reliableXpath = String(reliableXpath).trim();
        if (!reliableXpath) {
            console.warn('Could not generate XPath for key event:', target);
            return;
        }

        const step = {
            type: 'keyDown',
            xpath: `xpath=${reliableXpath}`,
            key: event.key,
            keyCode: event.keyCode,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            tag: target.tagName.toLowerCase(),
            timestamp: Date.now(),
            elementInfo: allPossibleXPaths.elementInfo,
            allXPaths: allPossibleXPaths // ✅ Store ALL XPaths
        };

        window.advancedXPathInspector.state.recordedSteps.push(step);
        saveStepsToStorage();
        console.log('🔑 Enhanced key step:', step);
    }
}

function handleRecordedChange(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;

    const el = event.target;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    
    // Handle various change events
    const allPossibleXPaths = getAllXPaths(el);
    let reliableXpath = getReliableXPath(allPossibleXPaths);

    if (!reliableXpath) {
        reliableXpath = getSmartLocator(el).replace('xpath=', '');
    }

    reliableXpath = String(reliableXpath).trim();
    if (!reliableXpath) {
        console.warn('Could not generate XPath for change event:', el);
        return;
    }

    let step = {
        xpath: `xpath=${reliableXpath}`,
        tag,
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths // ✅ Store ALL XPaths
    };

    // ✅ Handle different element types for change events
    if (tag === 'select') {
        const selectedOption = el.options[el.selectedIndex];
        step = {
            ...step,
            type: 'dropdown_change',
            value: selectedOption?.text || selectedOption?.value || '',
            selectedIndex: el.selectedIndex,
            multiple: el.multiple,
            allOptions: Array.from(el.options).map(opt => ({
                text: opt.text,
                value: opt.value,
                selected: opt.selected
            }))
        };
    } else if (tag === 'input') {
        switch (type) {
            case 'checkbox':
                step = {
                    ...step,
                    type: 'checkbox_change',
                    value: el.checked ? 'Checked' : 'Unchecked',
                    checked: el.checked
                };
                break;
            case 'radio':
                step = {
                    ...step,
                    type: 'radio_change',
                    value: el.value,
                    name: el.name,
                    checked: el.checked
                };
                break;
            case 'range':
                step = {
                    ...step,
                    type: 'slider_change',
                    value: el.value,
                    min: el.min,
                    max: el.max,
                    step: el.step
                };
                break;
            case 'file':
                step = {
                    ...step,
                    type: 'file_change',
                    value: el.files.length > 0 ? Array.from(el.files).map(f => f.name).join(', ') : '',
                    fileCount: el.files.length
                };
                break;
            default:
                step = {
                    ...step,
                    type: 'input_change',
                    value: el.value,
                    inputType: type
                };
        }
    } else if (tag === 'textarea') {
        step = {
            ...step,
            type: 'textarea_change',
            value: el.value
        };
    } else {
        step = {
            ...step,
            type: 'change',
            value: el.value || el.textContent?.trim() || ''
        };
    }

    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('🔄 Enhanced change step:', step);
}

// Listen for messages with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        const { state } = window.advancedXPathInspector;
        if (request.action === 'toggleInspector') {
            state.isInspectorActive = request.isActive;
            console.log('Inspector state toggled:', state.isInspectorActive);

            if (state.isInspectorActive) {
                cleanupEventListeners();
                document.addEventListener('mouseover', handleMouseOver, true);
                document.addEventListener('mouseout', handleMouseOut, true);
                document.addEventListener('click', handleClick, true);
                document.addEventListener('contextmenu', handleRightClick, true);
                document.addEventListener('keydown', handleKeyDown, true);
                document.body.style.cursor = 'crosshair';
                unlockElement();

                // Send shortcuts info to popup
                safeSendMessage({
                    action: 'updateShortcuts',
                    shortcuts: [
                        'Hover for 1s - Auto-lock element',
                        'Any key - Unlock',
                        'Any click - Unlock',
                        'ESC - Stop inspection'
                    ]
                });
            } else {
                cleanupEventListeners();
                document.body.style.cursor = '';
                unlockElement();
            }
            sendResponse({ success: true });
        } else if (request.action === 'getLockedElement') {
            // Handle request for current locked element data
            if (state.isLocked && state.hoveredElement) {
                const xpaths = getAllXPaths(state.hoveredElement);
                if (xpaths) {
                    safeSendMessage({
                        action: 'updateXPaths',
                        xpaths: xpaths,
                        isLocked: true,
                        elementInfo: {
                            tagName: state.hoveredElement.tagName.toLowerCase(),
                            id: state.hoveredElement.id || '',
                            className: state.hoveredElement.className || '',
                            type: state.hoveredElement.getAttribute('type') || '',
                            name: state.hoveredElement.getAttribute('name') || '',
                            value: state.hoveredElement.getAttribute('value') || '',
                            placeholder: state.hoveredElement.getAttribute('placeholder') || '',
                            text: state.hoveredElement.textContent.trim(),
                            role: state.hoveredElement.getAttribute('role') || ''
                        }
                    });
                }
            }
            sendResponse({ success: true });
        } else if (request.action === 'testXPath') {
            const result = testXPath(request.xpath);
            sendResponse(result);
            return true;
        } else if (request.action === 'clearHighlights') {
            clearHighlights();
            sendResponse({ success: true });
            return true;
        } else if (request.action === 'scrollToElement') {
            const elements = document.querySelectorAll('.xpath-highlight');
            if (elements[request.index]) {
                scrollElementIntoView(elements[request.index]);
            }
            sendResponse({ success: true });
            return true;
        } else if (request.action === 'getXPaths') {
            // Return all XPaths we have, possibly from a locked element
            if (state.isLocked && state.hoveredElement) {
                const xpaths = getAllXPaths(state.hoveredElement);
                console.log("Sending XPaths in response to getXPaths:", xpaths);
                
                // Also ensure we save these to storage for persistence
                chrome.storage.local.set({
                    lockedState: {
                        isLocked: true,
                        xpaths: xpaths,
                        timestamp: Date.now()
                    }
                });
                
                sendResponse({ xpaths: xpaths, success: true });
            } else {
                // Try to get from storage if we don't have a currently locked element
                chrome.storage.local.get(['lockedState'], function(result) {
                    if (result.lockedState && result.lockedState.xpaths) {
                        console.log("Sending stored XPaths from lockedState:", result.lockedState.xpaths);
                        sendResponse({ xpaths: result.lockedState.xpaths, success: true });
                    } else {
                        console.log("No XPaths available to send");
                        sendResponse({ success: false, error: "No locked element or stored XPaths found" });
                    }
                });
                return true; // Keep message channel open for async response
            }
        
        }
        if (request.action === 'startRecording') {
            state.isRecording = true;
            state.recordedSteps = [];
            chrome.storage.local.set({ isRecording: true, recordedSteps: [] });
            attachRecordingListeners();
            console.log("Recording started");
            sendResponse({ success: true });
        }

        if (request.action === 'stopRecording') {
            state.isRecording = false;
            chrome.storage.local.set({ isRecording: false, recordedSteps: state.recordedSteps });
            detachRecordingListeners();
            console.log("Recording stopped");
            sendResponse({ success: true });
        }

        else if (request.action === 'checkLockStatus') {
            try {
                console.log("Received checkLockStatus request");
                
                // Create an initial response in case we can't provide a full one
                let responseData = { 
                    isLocked: state.isLocked,
                    success: true
                };
                
                // Return current lock state and XPaths if element is locked
                if (state.isLocked && state.hoveredElement) {
                    try {
                        const xpaths = getAllXPaths(state.hoveredElement);
                        if (xpaths) {
                            responseData = { 
                                isLocked: state.isLocked, 
                                xpaths: xpaths,
                                elementInfo: xpaths.elementInfo || null,
                                success: true
                            };
                            console.log("Sending lock status with XPaths");
                            sendResponse(responseData);
                        } else {
                            console.log("No XPaths available for locked element");
                            sendResponse(responseData);
                        }
                    } catch (xpathError) {
                        console.error("Error getting XPaths for locked element:", xpathError);
                        responseData.error = "Error getting XPaths: " + xpathError.message;
                        sendResponse(responseData);
                    }
                } else {
                    // Try to get XPaths from storage if available
                    try {
                        chrome.storage.local.get(['lockedState'], function(result) {
                            try {
                                if (result && result.lockedState && result.lockedState.xpaths) {
                                    console.log("No active locked element, but found stored XPaths");
                                    sendResponse({ 
                                        isLocked: false, 
                                        xpaths: result.lockedState.xpaths,
                                        success: true
                                    });
                                } else {
                                    console.log("No locked element or stored XPaths");
                                    sendResponse(responseData);
                                }
                            } catch (storageError) {
                                console.error("Error processing storage data:", storageError);
                                responseData.error = "Error processing storage: " + storageError.message;
                                sendResponse(responseData);
                            }
                        });
                        return true; // Keep message channel open for async response
                    } catch (storageError) {
                        console.error("Error accessing storage:", storageError);
                        responseData.error = "Error accessing storage: " + storageError.message;
                        sendResponse(responseData);
                    }
                }
            } catch (error) {
                console.error("Error in checkLockStatus:", error);
                sendResponse({ 
                    isLocked: false, 
                    error: error.message,
                    success: false
                });
            }
            return true;
        }
    } catch (error) {
        console.log('Error handling message:', error);
    }
    return true;
});

// Start initialization
console.log('Starting XPath Inspector initialization');
initializeInspector();

// Function to safely get element class names
function getElementClasses(element) {
    if (!element || !element.classList) return '';
    return Array.from(element.classList).join(' ');
}

// Function to get all possible XPaths for element
function getAllXPaths(element) {
    if (!element) return null;
    
    try {
        // Basic element properties
        const tagName = element.tagName.toLowerCase();
        const id = element.id;
        const classNames = getElementClasses(element);
        const text = element.textContent.trim();
        const value = element.value;
        const type = element.getAttribute('type');
        const name = element.getAttribute('name');
        const role = element.getAttribute('role');
        const placeholder = element.getAttribute('placeholder');
        
        // Basic XPath
        const basicXPath = getElementXPath(element);
        
        // Initialize result object with consistent structure
        const result = {
            elementInfo: {
                tagName: tagName,
                id: id || '',
                className: classNames || '',
                type: type || '',
                name: name || '',
                value: value || '',
                placeholder: placeholder || '',
                text: text,
                role: role || '',
                xpath: basicXPath // Add the raw XPath to elementInfo
            },
            uniqueXPaths: [],
            formXPaths: [],
            specializedXPaths: [],
            xpaths: {
                classBased: [],
                roleBased: [],
                textValue: [],
                classRoleText: [],
                classRoleValue: [],
                classRoleIndex: [],
                classTextValue: [],
                parentRole: [],
                roleAttribute: [],
                multipleRoles: [],
                parentContext: [],
                verticalRelative: [],
                horizontalRelative: [],
                nearRelative: []
            }
        };
        
        // Generate optimal XPaths using the enhanced algorithm
        const optimizedXPaths = generateOptimalXPaths(element, tagName, text, {
            id: id,
            class: classNames,
            type: type,
            name: name,
            role: role,
            value: value,
            placeholder: placeholder
        });
        
        // Add unique identifiers (highest priority)
            if (id) {
            result.uniqueXPaths.push({
                xpath: `//${tagName}[@id="${id}"]`,
                type: 'id'
            });
            
            // Also add the *[@id=""] version which works regardless of tag name
            result.uniqueXPaths.push({
                xpath: `//*[@id="${id}"]`,
                type: 'id-any'
            });
        }

        // Process form elements
        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea' || tagName === 'button') {
            // Name attribute is common for form elements
            if (name) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@name="${name}"]`,
                    type: 'name'
                });
            }
            
            // Type attribute is useful for inputs
            if (type) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@type="${type}"]`,
                    type: 'type'
                });
                
                // Combine type and name for better specificity
                if (name) {
                    result.formXPaths.push({
                        xpath: `//${tagName}[@type="${type}" and @name="${name}"]`,
                        type: 'type+name'
                    });
                }
            }
            
            // Value can be useful for buttons and pre-filled inputs
            if (value) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@value="${value}"]`,
                    type: 'value'
                });
            }
            
            // Placeholder is common for modern inputs
            if (placeholder) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@placeholder="${placeholder}"]`,
                    type: 'placeholder'
                });
            }
        }

        // Add specialized XPaths
        const specializedXPaths = getSpecializedXPaths(element);
        if (specializedXPaths && specializedXPaths.length > 0) {
            result.specializedXPaths = specializedXPaths.map(xpath => ({
                xpath: xpath,
                type: 'specialized'
            }));
            
            // Add optimized XPaths to specialized section for better visibility
            const filteredOptimalXPaths = optimizedXPaths.filter(xpath => 
                !result.specializedXPaths.some(existingXPath => existingXPath.xpath === xpath)
            ).slice(0, 5); // Limit to top 5 optimized XPaths
            
            filteredOptimalXPaths.forEach(xpath => {
                result.specializedXPaths.push({
                    xpath: xpath,
                    type: 'optimal'
                });
            });
        }

        // Class-based XPaths
        if (classNames) {
            const classes = classNames.split(' ').filter(Boolean);
            if (classes.length > 0) {
                // Each individual class
                classes.forEach(cls => {
                    result.xpaths.classBased.push({
                        xpath: `//${tagName}[contains(@class, "${cls}")]`,
                        type: 'class'
                    });
                });
                
                // Full class name
                if (classes.length > 1) {
                    result.xpaths.classBased.push({
                        xpath: `//${tagName}[@class="${classNames}"]`,
                        type: 'full-class'
                    });
                }
            }
        }

        // Role-based XPaths
        if (role) {
            result.xpaths.roleBased.push({
                xpath: `//${tagName}[@role="${role}"]`,
                type: 'role'
            });
            
            // Role with class combinations
            if (classNames) {
                result.xpaths.roleBased.push({
                    xpath: `//${tagName}[@role="${role}" and contains(@class, "${classNames.split(' ')[0]}")]`,
                    type: 'role+class'
                });
            }
        }

        // Text-based XPaths (for non-input elements)
        if (text && tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
            result.xpaths.textValue.push({
                xpath: `//${tagName}[text()="${text}"]`,
                type: 'exact-text'
            });
            
            // For longer text, use contains
            if (text.length > 20) {
                result.xpaths.textValue.push({
                    xpath: `//${tagName}[contains(text(), "${text.substring(0, 20)}")]`,
                    type: 'contains-text'
                });
            }
            
            // Normalized text
            result.xpaths.textValue.push({
                xpath: `//${tagName}[normalize-space(text())="${text}"]`,
                type: 'normalized-text'
            });
            
            // ✅ ENHANCED: Case-insensitive text matching
            result.xpaths.textValue.push({
                xpath: `//${tagName}[translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')="${text.toLowerCase()}"]`,
                type: 'case-insensitive-text'
            });
            
            // ✅ ENHANCED: Partial text matching with different strategies
            if (text.length > 10) {
                const words = text.split(' ').filter(w => w.length > 2);
                if (words.length > 0) {
                    result.xpaths.textValue.push({
                        xpath: `//${tagName}[contains(normalize-space(text()), "${words[0]}")]`,
                        type: 'first-word-text'
                    });
                }
                
                if (words.length > 1) {
                    result.xpaths.textValue.push({
                        xpath: `//${tagName}[contains(normalize-space(text()), "${words[0]}") and contains(normalize-space(text()), "${words[1]}")]`,
                        type: 'multi-word-text'
                    });
                }
            }
        }

        // ✅ ENHANCED: Additional attribute-based XPaths
        const additionalAttributes = [
            'data-testid', 'data-test', 'data-cy', 'data-automation', 'data-qa',
            'aria-label', 'aria-describedby', 'aria-labelledby', 'title', 'alt',
            'href', 'src', 'for', 'accept', 'pattern', 'min', 'max', 'step'
        ];
        
        additionalAttributes.forEach(attr => {
            const attrValue = element.getAttribute(attr);
            if (attrValue) {
                result.xpaths.classBased.push({
                    xpath: `//${tagName}[@${attr}="${attrValue}"]`,
                    type: `attribute-${attr}`
                });
                
                // Also add contains version for longer attribute values
                if (attrValue.length > 10) {
                    result.xpaths.classBased.push({
                        xpath: `//${tagName}[contains(@${attr}, "${attrValue.substring(0, 10)}")]`,
                        type: `contains-${attr}`
                    });
                }
            }
        });

        // Parent context XPath
        try {
            const parentElement = element.parentElement;
            if (parentElement && parentElement.tagName) {
                const parentTag = parentElement.tagName.toLowerCase();
                const parentId = parentElement.id;
                const parentClass = parentElement.className;
                const parentRole = parentElement.getAttribute('role');
                
                if (parentId) {
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[@id="${parentId}"]/${tagName}`,
                        type: 'parent-id'
                    });
                    
                    // ✅ ENHANCED: Direct descendant and any descendant
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[@id="${parentId}"]//${tagName}`,
                        type: 'parent-id-descendant'
                    });
                } else if (parentClass) {
                    const firstParentClass = parentClass.split(' ')[0];
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[contains(@class, "${firstParentClass}")]/${tagName}`,
                        type: 'parent-class'
                    });
                    
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[contains(@class, "${firstParentClass}")]//${tagName}`,
                        type: 'parent-class-descendant'
                    });
                }
                
                // ✅ ENHANCED: Parent role-based XPaths
                if (parentRole) {
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[@role="${parentRole}"]/${tagName}`,
                        type: 'parent-role'
                    });
                    
                    result.xpaths.parentContext.push({
                        xpath: `//${parentTag}[@role="${parentRole}"]//${tagName}`,
                        type: 'parent-role-descendant'
                    });
                }
                
                // ✅ ENHANCED: Multi-level parent context
                const grandParent = parentElement.parentElement;
                if (grandParent && grandParent.tagName) {
                    const gpTag = grandParent.tagName.toLowerCase();
                    const gpId = grandParent.id;
                    const gpClass = grandParent.className;
                    
                    if (gpId) {
                        result.xpaths.parentContext.push({
                            xpath: `//${gpTag}[@id="${gpId}"]//${parentTag}//${tagName}`,
                            type: 'grandparent-id'
                        });
                    } else if (gpClass) {
                        const firstGpClass = gpClass.split(' ')[0];
                        result.xpaths.parentContext.push({
                            xpath: `//${gpTag}[contains(@class, "${firstGpClass}")]//${parentTag}//${tagName}`,
                            type: 'grandparent-class'
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Error generating parent context XPath:", error);
        }

        // Multi-attribute combinations
        // Class + Role + Text combinations
        if (classNames && role && text) {
            const firstClass = classNames.split(' ')[0];
            const shortText = text.substring(0, Math.min(text.length, 20));
            result.xpaths.classRoleText.push({
                xpath: `//${tagName}[contains(@class, "${firstClass}") and @role="${role}" and contains(text(), "${shortText}")]`,
                type: 'class+role+text'
            });
            
            // ✅ ENHANCED: Normalized space version
            result.xpaths.classRoleText.push({
                xpath: `//${tagName}[contains(@class, "${firstClass}") and @role="${role}" and contains(normalize-space(text()), "${shortText}")]`,
                type: 'class+role+normalized-text'
            });
        }
        
        // Class + Role + Value combinations
        if (classNames && role && value) {
            result.xpaths.classRoleValue.push({
                xpath: `//${tagName}[contains(@class, "${classNames.split(' ')[0]}") and @role="${role}" and @value="${value}"]`,
                type: 'class+role+value'
            });
        }
        
        // ✅ ENHANCED: More attribute combinations
        if (classNames && name) {
            result.xpaths.classRoleValue.push({
                xpath: `//${tagName}[contains(@class, "${classNames.split(' ')[0]}") and @name="${name}"]`,
                type: 'class+name'
            });
        }
        
        if (classNames && type) {
            result.xpaths.classRoleValue.push({
                xpath: `//${tagName}[contains(@class, "${classNames.split(' ')[0]}") and @type="${type}"]`,
                type: 'class+type'
            });
        }
        
        if (role && name) {
            result.xpaths.classRoleValue.push({
                xpath: `//${tagName}[@role="${role}" and @name="${name}"]`,
                type: 'role+name'
            });
        }
        
        if (role && type) {
            result.xpaths.classRoleValue.push({
                xpath: `//${tagName}[@role="${role}" and @type="${type}"]`,
                type: 'role+type'
            });
        }
        
        // Class + Role + Index combinations
        if (classNames && role) {
            let sameTagElements = document.querySelectorAll(`${tagName}[role="${role}"]`);
            if (sameTagElements.length > 1) {
                for (let i = 0; i < sameTagElements.length; i++) {
                    if (sameTagElements[i] === element) {
                        result.xpaths.classRoleIndex.push({
                            xpath: `//${tagName}[contains(@class, "${classNames.split(' ')[0]}") and @role="${role}"][${i+1}]`,
                            type: 'class+role+index'
                        });
                        break;
                    }
                }
            }
        }
        
        // ✅ ENHANCED: Sibling-based XPaths
        try {
            const prevSibling = element.previousElementSibling;
            const nextSibling = element.nextElementSibling;
            
            if (prevSibling) {
                const prevTag = prevSibling.tagName.toLowerCase();
                const prevId = prevSibling.id;
                const prevClass = prevSibling.className;
                const prevText = prevSibling.textContent.trim();
                
                if (prevId) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${prevTag}[@id="${prevId}"]/following-sibling::${tagName}[1]`,
                        type: 'after-sibling-id'
                    });
                } else if (prevClass) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${prevTag}[contains(@class, "${prevClass.split(' ')[0]}")]/following-sibling::${tagName}[1]`,
                        type: 'after-sibling-class'
                    });
                } else if (prevText && prevText.length < 30) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${prevTag}[contains(text(), "${prevText.substring(0, 15)}")]/following-sibling::${tagName}[1]`,
                        type: 'after-sibling-text'
                    });
                }
            }
            
            if (nextSibling) {
                const nextTag = nextSibling.tagName.toLowerCase();
                const nextId = nextSibling.id;
                const nextClass = nextSibling.className;
                const nextText = nextSibling.textContent.trim();
                
                if (nextId) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${nextTag}[@id="${nextId}"]/preceding-sibling::${tagName}[1]`,
                        type: 'before-sibling-id'
                    });
                } else if (nextClass) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${nextTag}[contains(@class, "${nextClass.split(' ')[0]}")]/preceding-sibling::${tagName}[1]`,
                        type: 'before-sibling-class'
                    });
                } else if (nextText && nextText.length < 30) {
                    result.xpaths.horizontalRelative.push({
                        xpath: `//${nextTag}[contains(text(), "${nextText.substring(0, 15)}")]/preceding-sibling::${tagName}[1]`,
                        type: 'before-sibling-text'
                    });
                }
            }
        } catch (error) {
            console.error("Error generating sibling-based XPaths:", error);
        }
        
        // Class + Text + Value combinations
        if (classNames && text && value) {
            result.xpaths.classTextValue.push({
                xpath: `//${tagName}[contains(@class, "${classNames.split(' ')[0]}") and contains(text(), "${text.substring(0, Math.min(text.length, 20))}") and @value="${value}"]`,
                type: 'class+text+value'
            });
        }
        
        // Nested Role XPaths - Parent Role + Current Role
        try {
            const parentElement = element.parentElement;
            if (parentElement && parentElement.tagName && role) {
                const parentRole = parentElement.getAttribute('role');
                if (parentRole) {
                    result.xpaths.parentRole.push({
                        xpath: `//${parentElement.tagName.toLowerCase()}[@role="${parentRole}"]/${tagName}[@role="${role}"]`,
                        type: 'parent-role+current-role'
                    });
                }
            }
        } catch (error) {
            console.error("Error generating nested role XPath:", error);
        }
        
        // Role + Class/Text
        if (role && (classNames || text)) {
            if (classNames) {
                result.xpaths.roleAttribute.push({
                    xpath: `//${tagName}[@role="${role}" and contains(@class, "${classNames.split(' ')[0]}")]`,
                    type: 'role+class'
                });
            }
            
            if (text) {
                result.xpaths.roleAttribute.push({
                    xpath: `//${tagName}[@role="${role}" and contains(text(), "${text.substring(0, Math.min(text.length, 20))}")]`,
                    type: 'role+text'
                });
            }
        }
        
        // Multiple Parent Roles
        try {
            let currentEl = element;
            let roleChain = [];
            let depth = 0;
            
            // Go up max 3 levels looking for roles
            while (currentEl && depth < 3) {
                const elRole = currentEl.getAttribute('role');
                if (elRole) {
                    roleChain.push({
                        tag: currentEl.tagName.toLowerCase(),
                        role: elRole
                    });
                }
                currentEl = currentEl.parentElement;
                depth++;
            }
            
            // If we found at least 2 roles in the chain
            if (roleChain.length >= 2) {
                let xpath = '';
                for (let i = roleChain.length - 1; i >= 0; i--) {
                    xpath += `//${roleChain[i].tag}[@role="${roleChain[i].role}"]`;
                    if (i > 0) xpath += '/descendant::';
                }
                
                result.xpaths.multipleRoles.push({
                    xpath: xpath,
                    type: 'multiple-parent-roles'
                });
            }
        } catch (error) {
            console.error("Error generating multiple parent roles XPath:", error);
        }
        
        // Position-based XPaths (above/below, left/right)
        try {
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Find elements above/below
            const verticalElements = Array.from(document.elementsFromPoint(centerX, centerY - rect.height))
                .concat(Array.from(document.elementsFromPoint(centerX, centerY + rect.height * 2)))
                .filter(el => el !== element && el.tagName !== 'HTML' && el.tagName !== 'BODY');
            
            // Find elements left/right
            const horizontalElements = Array.from(document.elementsFromPoint(centerX - rect.width, centerY))
                .concat(Array.from(document.elementsFromPoint(centerX + rect.width * 2, centerY)))
                .filter(el => el !== element && el.tagName !== 'HTML' && el.tagName !== 'BODY');
            
            // Add vertical position XPaths
            if (verticalElements.length > 0) {
                const reference = verticalElements[0];
                const refRect = reference.getBoundingClientRect();
                const isBelow = refRect.top < rect.top;
                const refTag = reference.tagName.toLowerCase();
                const refId = reference.id;
                const refClass = reference.className;
                const refText = reference.textContent.trim();
                
                let refPath = '';
                if (refId) {
                    refPath = `//${refTag}[@id="${refId}"]`;
                } else if (refClass) {
                    refPath = `//${refTag}[contains(@class, "${refClass.split(' ')[0]}")]`;
                } else if (refText) {
                    refPath = `//${refTag}[contains(text(), "${refText.substring(0, Math.min(refText.length, 20))}")]`;
                }
                
                if (refPath) {
                    const relation = isBelow ? 'following::' : 'preceding::';
                    result.xpaths.verticalRelative.push({
                        xpath: `${refPath}/${relation}${tagName}`,
                        type: isBelow ? 'below-element' : 'above-element'
                    });
                }
            }
            
            // Add horizontal position XPaths
            if (horizontalElements.length > 0) {
                const reference = horizontalElements[0];
                const refRect = reference.getBoundingClientRect();
                const isRight = refRect.left < rect.left;
                const refTag = reference.tagName.toLowerCase();
                const refId = reference.id;
                const refClass = reference.className;
                const refText = reference.textContent.trim();
                
                let refPath = '';
                if (refId) {
                    refPath = `//${refTag}[@id="${refId}"]`;
                } else if (refClass) {
                    refPath = `//${refTag}[contains(@class, "${refClass.split(' ')[0]}")]`;
                } else if (refText) {
                    refPath = `//${refTag}[contains(text(), "${refText.substring(0, Math.min(refText.length, 20))}")]`;
                }
                
                if (refPath) {
                    const relation = isRight ? 'following-sibling::' : 'preceding-sibling::';
                    result.xpaths.horizontalRelative.push({
                        xpath: `${refPath}/${relation}${tagName}`,
                        type: isRight ? 'right-of-element' : 'left-of-element'
                    });
                }
            }
            
            // Near elements XPath
            const nearElements = document.elementsFromPoint(centerX, centerY)
                .filter(el => el !== element && el.tagName !== 'HTML' && el.tagName !== 'BODY');
            
            if (nearElements.length > 0) {
                const reference = nearElements[0];
                const refTag = reference.tagName.toLowerCase();
                const refId = reference.id;
                const refClass = reference.className;
                const refText = reference.textContent.trim();
                
                let refPath = '';
                if (refId) {
                    refPath = `//${refTag}[@id="${refId}"]`;
                } else if (refClass) {
                    refPath = `//${refTag}[contains(@class, "${refClass.split(' ')[0]}")]`;
                } else if (refText) {
                    refPath = `//${refTag}[contains(text(), "${refText.substring(0, Math.min(refText.length, 20))}")]`;
                }
                
                if (refPath) {
                    result.xpaths.nearRelative.push({
                        xpath: `${refPath}/following::${tagName}`,
                        type: 'near-element'
                    });
                }
            }
        } catch (error) {
            console.error("Error generating position-based XPaths:", error);
        }
        
        // Ensure we have at least one XPath by using the raw XPath
        if (result.uniqueXPaths.length === 0 && 
            result.formXPaths.length === 0 && 
            result.specializedXPaths.length === 0 && 
            Object.values(result.xpaths).every(arr => arr.length === 0)) {
            
            result.specializedXPaths.push({
                xpath: basicXPath,
                type: 'fallback'
            });
        }
        
        return result;
    } catch (error) {
        console.error("Error getting all XPaths:", error);
        // Return a minimal structure with just the basic XPath
        try {
            const basicXPath = getElementXPath(element);
        return {
            elementInfo: {
                    tagName: element.tagName.toLowerCase(),
                    id: element.id || '',
                    className: element.className || '',
                    text: element.textContent.trim(),
                    xpath: basicXPath
                },
                specializedXPaths: [{
                    xpath: basicXPath,
                    type: 'fallback-error'
                }]
            };
        } catch (innerError) {
            console.error("Error creating fallback XPath:", innerError);
        return null;
        }
    }
}

// New function for generating optimal XPaths
function generateOptimalXPaths(element, tagName, text, attributes) {
    const xpaths = [];
    
    // Helper function to escape quotes in text
    function escapeQuotes(str) {
        if (!str) return '';
        return str.replace(/"/g, '\\"').replace(/'/g, "\\'");
    }
    
    // Get parent hierarchy for context
    const parentHierarchy = [];
    try {
        let parentNode = element.parentElement;
        let level = 0;
        
        // Get up to 3 levels of parent context
        while (parentNode && level < 3) {
            const parentClass = parentNode.className || '';
            const parentId = parentNode.id || '';
            const parentTag = parentNode.tagName.toLowerCase();
            const parentRole = parentNode.getAttribute('role') || '';
            
            if (parentId) {
                parentHierarchy.push({
                    tag: parentTag,
                    id: parentId,
                    className: parentClass,
                    role: parentRole
                });
            } else if (parentClass) {
                parentHierarchy.push({
                    tag: parentTag,
                    className: parentClass,
                    role: parentRole
                });
            }
            
            parentNode = parentNode.parentElement;
            level++;
        }
    } catch (e) {
        console.error("Error getting parent hierarchy:", e);
    }
    
    // 1. ID – strongest
    if (attributes.id) {
        xpaths.push(`//${tagName}[@id="${attributes.id}"]`);
        xpaths.push(`//*[@id="${attributes.id}"]`);
    }

    // 2. Exact Text with normalization for non-input elements
    if (text && tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
        const safeText = escapeQuotes(text);
        xpaths.push(`//${tagName}[text()="${safeText}"]`);
        xpaths.push(`//${tagName}[normalize-space(text())="${safeText}"]`);
        
        // 3. Partial Text - use beginning of text for more stability
        if (safeText.length >= 4) {
            const partialText = safeText.substring(0, Math.min(20, safeText.length));
            xpaths.push(`//${tagName}[contains(text(), "${partialText}")]`);
            xpaths.push(`//${tagName}[contains(normalize-space(text()), "${partialText}")]`);
        }
    }

    // 4. Class filtering (prioritize meaningful class parts, avoid dynamic ones)
    const classAttr = attributes.class || '';
    const classes = classAttr.split(' ').filter(Boolean);
    const safeClasses = classes.filter(cls => 
        !cls.includes(':') && // Avoid pseudo-classes from CSS frameworks
        !cls.match(/(\d{3,}|^[a-f0-9]{6,}$)/) && // Avoid auto-generated classes with digits or hex
        cls.length > 2 && // Avoid very short classes
        !cls.match(/^(active|selected|disabled|hidden|visible|hover)$/) // Avoid state classes
    );

    if (safeClasses.length > 0) {
        // Single class selectors
        safeClasses.forEach(cls => {
            xpaths.push(`//${tagName}[contains(@class, "${cls}")]`);
        });

        // Multi-class combinations (up to 3 classes)
        if (safeClasses.length >= 2) {
            const classCombo = safeClasses.slice(0, Math.min(3, safeClasses.length))
                .map(cls => `contains(@class, "${cls}")`)
                .join(" and ");
            xpaths.push(`//${tagName}[${classCombo}]`);
        }
    }

    // 5. Custom attributes (data-id, aria-label, href, etc.)
    const customAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'aria-label', 'href', 'src', 'alt', 'title'];
    
    for (const attr of customAttrs) {
        const val = element.getAttribute(attr);
        if (val && val.length < 100) { // Avoid excessively long attribute values
            xpaths.push(`//${tagName}[@${attr}="${escapeQuotes(val)}"]`);
            
            // For longer values, use contains with first part
            if (val.length > 20) {
                const partialVal = val.substring(0, 20);
                xpaths.push(`//${tagName}[contains(@${attr}, "${escapeQuotes(partialVal)}")]`);
            }
        }
    }

    // 6. Role + Text/Class (ARIA)
    if (attributes.role && text && tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
        xpaths.push(`//${tagName}[@role="${attributes.role}" and contains(text(), "${escapeQuotes(text.substring(0, Math.min(20, text.length)))}")]`);
    }
    
    if (attributes.role && safeClasses.length > 0) {
        xpaths.push(`//${tagName}[@role="${attributes.role}" and contains(@class, "${safeClasses[0]}")]`);
    }

    // 7. Parent Contextual XPaths
    parentHierarchy.forEach(parent => {
        let parentSelector = parent.tag;
        
        if (parent.id) {
            parentSelector = `${parent.tag}[@id="${parent.id}"]`;
        } else if (parent.className) {
            const parentClasses = parent.className.split(' ').filter(Boolean);
            if (parentClasses.length > 0) {
                const safeParentClass = parentClasses.find(cls => 
                    !cls.includes(':') && !cls.match(/(\d{3,}|^[a-f0-9]{6,}$)/) && cls.length > 2
                ) || parentClasses[0];
                
                parentSelector = `${parent.tag}[contains(@class, "${safeParentClass}")]`;
            }
        }
        
        if (text && tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
            // Parent + Text
            xpaths.push(`//${parentSelector}//${tagName}[contains(text(), "${escapeQuotes(text.substring(0, Math.min(20, text.length)))}")]`);
        }
        
        if (attributes.id) {
            // Parent + ID (very strong)
            xpaths.push(`//${parentSelector}//${tagName}[@id="${attributes.id}"]`);
        }
        
        if (safeClasses.length > 0) {
            // Parent + Class
            xpaths.push(`//${parentSelector}//${tagName}[contains(@class, "${safeClasses[0]}")]`);
        }
    });

    // 8. Near text (siblings and neighbors)
    try {
        // Get text from previous element siblings
        const prevSibling = element.previousElementSibling;
        if (prevSibling) {
            const prevText = prevSibling.textContent.trim();
            if (prevText && prevText.length > 0 && prevText.length < 50) {
                const safeText = escapeQuotes(prevText);
                xpaths.push(`//${prevSibling.tagName.toLowerCase()}[contains(text(), "${safeText}")]/following-sibling::${tagName}`);
            }
        }
        
        // Get text from parent's first child if it contains readable text
        const parentFirstChild = element.parentElement?.firstElementChild;
        if (parentFirstChild && parentFirstChild !== element) {
            const siblingText = parentFirstChild.textContent.trim();
            if (siblingText && siblingText.length > 0 && siblingText.length < 50) {
                const safeText = escapeQuotes(siblingText);
                xpaths.push(`//${parentFirstChild.tagName.toLowerCase()}[contains(text(), "${safeText}")]/following::${tagName}`);
            }
        }
    } catch (e) {
        console.error("Error generating near-text XPaths:", e);
    }
    
    // Filter out duplicates
    return [...new Set(xpaths)];
}

// Generate absolute XPath (Robot Framework compatible)
function getAbsoluteXPath(element) {
    if (!element) return '';
    const paths = [];
    
    while (element && element.nodeType === 1) {
        let index = 1;
        let sibling = element.previousSibling;
        
        while (sibling) {
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
            }
            sibling = sibling.previousSibling;
        }
        
        const tagName = element.tagName.toLowerCase();
        // Robot Framework prefers explicit indexing
        paths.unshift(`${tagName}[${index}]`);
        element = element.parentNode;
    }
    
    return '//' + paths.join('/');
}

// Generate relative XPath (Robot Framework compatible)
function getRelativeXPath(element) {
    if (!element) return '';
    
    // Try ID - Most reliable for Robot Framework
    if (element.id) {
        return `//*[@id="${element.id}"]`;
    }
    
    // Try name attribute - Common in forms
    if (element.getAttribute('name')) {
        return `//*[@name="${element.getAttribute('name')}"]`;
    }

    // Try value for input elements
    if (element.tagName.toLowerCase() === 'input' && element.getAttribute('value')) {
        return `//${element.tagName.toLowerCase()}[@value="${element.getAttribute('value')}"]`;
    }

    // Try placeholder for input elements
    if (element.getAttribute('placeholder')) {
        return `//*[@placeholder="${element.getAttribute('placeholder')}"]`;
    }

    // Try exact class match instead of contains
    if (element.className && typeof element.className === 'string') {
        const classes = element.className.trim().split(/\s+/);
        if (classes.length > 0) {
            return `//*[@class="${element.className}"]`;
        }
    }
    
    // Fallback to tag with index
    return getAbsoluteXPath(element);
}

// Generate text-based XPath (Robot Framework compatible)
function getTextBasedXPath(element) {
    if (!element) return '';
    
    const xpaths = [];
    
    // Get direct text content
    const text = element.textContent.trim();
    if (text) {
        // Exact text match with normalize-space
        xpaths.push(`//*[normalize-space()="${text}"]`);
        // Element-specific exact text match
        xpaths.push(`//${element.tagName.toLowerCase()}[normalize-space()="${text}"]`);
        // Partial text match
        xpaths.push(`//*[contains(normalize-space(),"${text}")]`);
        // Case-insensitive text match
        xpaths.push(`//*[translate(normalize-space(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')="${text.toLowerCase()}"]`);
    }

    // Get placeholder text
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
        // Exact placeholder match
        xpaths.push(`//*[@placeholder="${placeholder}"]`);
        // Element-specific placeholder match
        xpaths.push(`//${element.tagName.toLowerCase()}[@placeholder="${placeholder}"]`);
        // Partial placeholder match
        xpaths.push(`//*[contains(@placeholder,"${placeholder}")]`);
    }

    // Get title attribute
    const title = element.getAttribute('title');
    if (title) {
        xpaths.push(`//*[@title="${title}"]`);
        xpaths.push(`//*[contains(@title,"${title}")]`);
    }

    // Get aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
        xpaths.push(`//*[@aria-label="${ariaLabel}"]`);
        xpaths.push(`//*[contains(@aria-label,"${ariaLabel}")]`);
    }

    return xpaths.join(' | ');
}

// Generate label-based XPath (Robot Framework compatible)
function getLabelBasedXPath(element) {
    if (!element) return '';
    
    const xpaths = [];
    
    // For input elements, try to find associated label
    if (['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())) {
        // Try finding label by for attribute
        if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label && label.textContent.trim()) {
                const labelText = label.textContent.trim();
                xpaths.push(`//*[@id=(//label[normalize-space()="${labelText}"]/@for)]`);
                xpaths.push(`//label[normalize-space()="${labelText}"]/following::*[1]`);
                xpaths.push(`//label[contains(normalize-space(),"${labelText}")]/following::*[1]`);
            }
        }
        
        // Try finding parent label
        let parent = element.parentElement;
        while (parent) {
            if (parent.tagName.toLowerCase() === 'label' && parent.textContent.trim()) {
                const labelText = parent.textContent.trim();
                xpaths.push(`//label[normalize-space()="${labelText}"]//${element.tagName.toLowerCase()}`);
                xpaths.push(`//label[contains(normalize-space(),"${labelText}")]//${element.tagName.toLowerCase()}`);
                break;
            }
            parent = parent.parentElement;
        }

        // Try finding label in preceding siblings
        const prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.tagName.toLowerCase() === 'label') {
            const labelText = prevSibling.textContent.trim();
            xpaths.push(`//label[normalize-space()="${labelText}"]/following::*[1]`);
        }
    }

    return xpaths.join(' | ');
}

// Generate enhanced attribute-based XPath (Robot Framework compatible)
function getAttributeBasedXPath(element) {
    if (!element) return '';
    const tagName = element.tagName.toLowerCase();
    const attributes = [];
    
    // Common attributes for all elements
    const commonAttrs = {
        'id': '@id',
        'name': '@name',
        'class': '@class',
        'role': '@role',
        'aria-label': '@aria-label',
        'data-test': '@data-test',
        'data-testid': '@data-testid',
        'data-qa': '@data-qa',
        'data-cy': '@data-cy',
        'data-automation': '@data-automation'
    };

    // Add common attributes
    for (const [attr, xpath] of Object.entries(commonAttrs)) {
        const value = element.getAttribute(attr);
        if (value) {
            attributes.push(`${xpath}="${value}"`);
        }
    }

    // Element-specific attributes
    switch (tagName) {
        case 'input':
            const type = element.getAttribute('type');
            if (type) attributes.push(`@type="${type}"`);
            const value = element.getAttribute('value');
            if (value) attributes.push(`@value="${value}"`);
            const placeholder = element.getAttribute('placeholder');
            if (placeholder) attributes.push(`@placeholder="${placeholder}"`);
            break;
            
        case 'a':
            const href = element.getAttribute('href');
            if (href) attributes.push(`@href="${href}"`);
            break;
            
        case 'img':
            const alt = element.getAttribute('alt');
            if (alt) attributes.push(`@alt="${alt}"`);
            const src = element.getAttribute('src');
            if (src) attributes.push(`@src[contains(.,"${src.split('/').pop()}")]`);
            break;
            
        case 'button':
            const btnType = element.getAttribute('type');
            if (btnType) attributes.push(`@type="${btnType}"`);
            const btnText = element.textContent.trim();
            if (btnText) attributes.push(`normalize-space()="${btnText}"`);
            break;
            
        case 'select':
            const multiple = element.multiple;
            if (multiple) attributes.push('@multiple');
            break;
            
        case 'textarea':
            const rows = element.getAttribute('rows');
            if (rows) attributes.push(`@rows="${rows}"`);
            const cols = element.getAttribute('cols');
            if (cols) attributes.push(`@cols="${cols}"`);
            break;
    }

    // Build XPath combinations
    const xpaths = [];
    
    // Single attribute XPaths
    attributes.forEach(attr => {
        xpaths.push(`//${tagName}[${attr}]`);
        xpaths.push(`//*[${attr}]`);
    });

    // Combine attributes for more specific XPaths
    if (attributes.length > 1) {
        xpaths.push(`//${tagName}[${attributes.join(' and ')}]`);
        // Add combinations of two attributes
        for (let i = 0; i < attributes.length; i++) {
            for (let j = i + 1; j < attributes.length; j++) {
                xpaths.push(`//${tagName}[${attributes[i]} and ${attributes[j]}]`);
            }
        }
    }

    return xpaths.join(' | ');
}

// Generate specialized XPath patterns
function getSpecializedXPaths(element) {
    if (!element) return [];
    
    const xpaths = [];
    const tag = element.tagName.toLowerCase();
    const text = element.textContent.trim();
    const className = element.className;
    
    // 1. Absolute Match (exact class and text)
    if (className && text) {
        xpaths.push({
            type: 'Absolute Match',
            xpath: `//${tag}[@class='${className}' and text()='${text}']`
        });
    }
    
    // 2. Contains Text
    if (text) {
        xpaths.push({
            type: 'Contains Text',
            xpath: `//${tag}[contains(text(), '${text}')]`
        });
    }
    
    // 3. Contains Class (for multiple classes)
    if (className && text) {
        const classes = className.split(' ');
        classes.forEach(cls => {
            if (cls.trim()) {
                xpaths.push({
                    type: 'Contains Class',
                    xpath: `//${tag}[contains(@class, '${cls}') and text()='${text}']`
                });
            }
        });
    }
    
    // 4. Normalize-space Text
    if (text) {
        xpaths.push({
            type: 'Normalize-space Text',
            xpath: `//${tag}[normalize-space(text())='${text}']`
        });
    }
    
    // 5. Parent-based XPaths
    let parent = element.parentElement;
    if (parent) {
        const parentTag = parent.tagName.toLowerCase();
        const parentClass = parent.className;
        
        // Basic parent-child relationship
        xpaths.push({
            type: 'Parent-based',
            xpath: `//${parentTag}//${tag}[text()='${text}']`
        });
        
        // Parent with class
        if (parentClass) {
            xpaths.push({
                type: 'Parent with Class',
                xpath: `//${parentTag}[contains(@class, '${parentClass}')]//${tag}[text()='${text}']`
            });
        }
        
        // Look for specific parent types
        let currentElement = element.parentElement;
        while (currentElement && currentElement !== document.body) {
            const currentTag = currentElement.tagName.toLowerCase();
            if (['nav', 'div', 'header', 'section', 'main'].includes(currentTag)) {
                const currentClass = currentElement.className;
                if (currentClass) {
                    xpaths.push({
                        type: `${currentTag.toUpperCase()} Parent`,
                        xpath: `//${currentTag}[contains(@class, '${currentClass}')]//${tag}[text()='${text}']`
                    });
                }
            }
            currentElement = currentElement.parentElement;
        }
    }
    
    return xpaths;
}

// Generate modern relative locator XPaths (Selenium 4 style)
function getModernRelativeXPaths(element) {
    if (!element) return '';
    
    const xpaths = [];
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    // Helper function to get text content safely
    function getVisibleText(el) {
        return el.textContent.trim().replace(/["']/g, '');
    }

    // Helper function to get normalized text-based locator
    function getTextBasedLocator(el) {
        const text = getVisibleText(el);
        if (!text) return null;

        // Try exact match with normalize-space
        const exactMatch = `//*[normalize-space()="${text}"]`;
        
        // Try contains for longer text
        const containsMatch = `//*[contains(normalize-space(), "${text}")]`;
        
        // Try starts-with for dynamic text
        const startsWithMatch = `//*[starts-with(normalize-space(), "${text.split(' ')[0]}")]`;
        
        return [exactMatch, containsMatch, startsWithMatch];
    }

    // Helper function to get class-based locator
    function getClassBasedLocator(el) {
        const className = el.className;
        if (!className || typeof className !== 'string') return null;
        
        const classes = className.split(' ').filter(c => c);
        if (classes.length === 0) return null;

        // Try with specific class combinations
        return classes.map(cls => `//*[contains(@class, "${cls}")]`);
    }

    // Find elements above (with better context)
    document.elementsFromPoint(centerX, rect.top - 10).forEach(refElement => {
        if (refElement === element) return;
        
        // Get text-based locators
        const textLocators = getTextBasedLocator(refElement);
        if (textLocators) {
            textLocators.forEach(locator => {
                // Using following axis
                xpaths.push(`${locator}/following::*[1]`);
                // Using following-sibling for adjacent elements
                xpaths.push(`${locator}/following-sibling::*[1]`);
                // Using parent-child relationship
                xpaths.push(`${locator}/parent::*/following-sibling::*//self::${element.tagName.toLowerCase()}`);
            });
        }

        // Get class-based locators
        const classLocators = getClassBasedLocator(refElement);
        if (classLocators) {
            classLocators.forEach(locator => {
                xpaths.push(`${locator}/following::*[1]`);
                xpaths.push(`${locator}/following-sibling::*[1]`);
            });
        }
    });

    // Find elements below (with better context)
    document.elementsFromPoint(centerX, rect.bottom + 10).forEach(refElement => {
        if (refElement === element) return;
        
        const textLocators = getTextBasedLocator(refElement);
        if (textLocators) {
            textLocators.forEach(locator => {
                // Using preceding axis
                xpaths.push(`${locator}/preceding::*[1]`);
                // Using preceding-sibling for adjacent elements
                xpaths.push(`${locator}/preceding-sibling::*[1]`);
                // Using ancestor relationship
                xpaths.push(`${locator}/ancestor::*[1]/preceding-sibling::*//self::${element.tagName.toLowerCase()}`);
            });
        }

        const classLocators = getClassBasedLocator(refElement);
        if (classLocators) {
            classLocators.forEach(locator => {
                xpaths.push(`${locator}/preceding::*[1]`);
                xpaths.push(`${locator}/preceding-sibling::*[1]`);
            });
        }
    });

    // Find elements to the left/right (with better context)
    ['left', 'right'].forEach(direction => {
        const x = direction === 'left' ? rect.left - 10 : rect.right + 10;
        document.elementsFromPoint(x, centerY).forEach(refElement => {
            if (refElement === element) return;

            const textLocators = getTextBasedLocator(refElement);
            if (textLocators) {
                textLocators.forEach(locator => {
                    if (direction === 'left') {
                        // Left of element
                        xpaths.push(`${locator}/following-sibling::*[1]`);
                        xpaths.push(`${locator}/following::*[1]`);
                        // Using parent context
                        xpaths.push(`${locator}/parent::*/following-sibling::*[1]`);
                    } else {
                        // Right of element
                        xpaths.push(`${locator}/preceding-sibling::*[1]`);
                        xpaths.push(`${locator}/preceding::*[1]`);
                        // Using parent context
                        xpaths.push(`${locator}/parent::*/preceding-sibling::*[1]`);
                    }
                });
            }

            const classLocators = getClassBasedLocator(refElement);
            if (classLocators) {
                classLocators.forEach(locator => {
                    if (direction === 'left') {
                        xpaths.push(`${locator}/following-sibling::*[1]`);
                        xpaths.push(`${locator}/following::*[1]`);
                    } else {
                        xpaths.push(`${locator}/preceding-sibling::*[1]`);
                        xpaths.push(`${locator}/preceding::*[1]`);
                    }
                });
            }
        });
    });

    // Find nearby elements (with better context)
    const nearbyElements = document.elementsFromPoint(centerX, centerY).filter(el => {
        if (el === element) return false;
        const elRect = el.getBoundingClientRect();
        const distance = Math.sqrt(
            Math.pow(centerX - (elRect.left + elRect.width/2), 2) +
            Math.pow(centerY - (elRect.top + elRect.height/2), 2)
        );
        return distance <= 50;
    });

    nearbyElements.forEach(refElement => {
        const textLocators = getTextBasedLocator(refElement);
        if (textLocators) {
            textLocators.forEach(locator => {
                // Near relationships using various axes
                xpaths.push(`${locator}/following::*[1]`);
                xpaths.push(`${locator}/preceding::*[1]`);
                xpaths.push(`${locator}/following-sibling::*[1]`);
                xpaths.push(`${locator}/preceding-sibling::*[1]`);
                // Using common ancestor
                xpaths.push(`${locator}/ancestor::*[contains(@class, "container") or contains(@class, "section")]//*[self::${element.tagName.toLowerCase()}]`);
            });
        }

        const classLocators = getClassBasedLocator(refElement);
        if (classLocators) {
            classLocators.forEach(locator => {
                xpaths.push(`${locator}/following::*[1]`);
                xpaths.push(`${locator}/preceding::*[1]`);
                // Using parent container
                xpaths.push(`${locator}/parent::*//*[self::${element.tagName.toLowerCase()}]`);
            });
        }
    });

    // Add form-specific relative locators
    if (['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())) {
        // Find associated label
        const id = element.id;
        if (id) {
            xpaths.push(`//label[@for="${id}"]/following::*[1]`);
            xpaths.push(`//label[normalize-space()="${getVisibleText(element)}"]/following::*[1]`);
        }
        
        // Find nearby form elements
        xpaths.push(`//label[contains(normalize-space(), "${getVisibleText(element)}")]/following::input[1]`);
        xpaths.push(`//label[starts-with(normalize-space(), "${getVisibleText(element).split(' ')[0]}")]/following::*[self::input or self::select or self::textarea][1]`);
    }

    // Filter out empty or duplicate XPaths
    return [...new Set(xpaths.filter(xpath => xpath && xpath.length > 0))].join(' | ');
}

// Add XPath testing functionality
function testXPath(xpath) {
    try {
        // Clear any existing highlights
        clearHighlights();
        
        // Debug logging
        console.log('Testing XPath:', xpath);
        
        // Function to check if an element is the most specific match
        function isTargetElement(element, allMatches) {
            // If this is the only match, it's the target
            if (allMatches.length === 1) return true;
            
            // Check if this element is a parent of any other matches
            return !allMatches.some(otherElement => {
                if (otherElement === element) return false;
                return element.contains(otherElement);
            });
        }

        // Try XPath variations
        const xpathVariations = [
            xpath,
            xpath.replace('text()', '.'),
            xpath.replace('contains(text()', 'contains(normalize-space(.)'),
            `${xpath} | //*[contains(., '${xpath.match(/'([^']+)'/)?.[1] || ''}')]`,
            `//*[contains(normalize-space(.), '${xpath.match(/'([^']+)'/)?.[1] || ''}')]`
        ];
        
        let allMatches = [];
        let successfulXPath = '';
        
        // Try each XPath variation
        for (const xpathVariation of xpathVariations) {
            try {
                console.log('Trying XPath variation:', xpathVariation);
                
                const result = document.evaluate(
                    xpathVariation,
                    document,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                
                if (result.snapshotLength > 0) {
                    console.log(`Found ${result.snapshotLength} matches with:`, xpathVariation);
                    
                    // Collect all matches first
                    const newMatches = [];
                    for (let i = 0; i < result.snapshotLength; i++) {
                        const element = result.snapshotItem(i);
                        if (element && !allMatches.includes(element)) {
                            newMatches.push(element);
                            console.log('Found element:', {
                                tagName: element.tagName,
                                textContent: element.textContent,
                                innerHTML: element.innerHTML,
                                className: element.className,
                                path: getElementXPath(element)
                            });
                        }
                    }
                    
                    if (newMatches.length > 0) {
                        allMatches = [...allMatches, ...newMatches];
                        successfulXPath = xpathVariation;
                        break;
                    }
                }
            } catch (e) {
                console.log('Error with XPath variation:', e);
                continue;
            }
        }

        // Filter to only target elements (most specific matches)
        const targetElements = allMatches.filter(element => isTargetElement(element, allMatches));
        console.log('Target elements:', targetElements.length, 'out of', allMatches.length, 'total matches');

        // Highlight only target elements
        targetElements.forEach((element, index) => {
            if (element.nodeType === Node.ELEMENT_NODE) {
                // Add highlight class
                element.classList.add('xpath-highlight');
                
                // Store original styles
                const originalStyles = {
                    outline: element.style.outline,
                    backgroundColor: element.style.backgroundColor,
                    position: element.style.position,
                    zIndex: element.style.zIndex,
                    transition: element.style.transition
                };
                
                // Apply highlight styles
                element.style.outline = '3px solid #ff4444 !important';
                element.style.backgroundColor = 'rgba(255, 68, 68, 0.1)';
                element.style.position = 'relative';
                element.style.zIndex = '10000';
                element.style.transition = 'all 0.3s ease';
                
                // Add hover effect
                element.addEventListener('mouseenter', () => {
                    element.style.outline = '3px solid #ff0000';
                    element.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                    element.style.zIndex = '10001';
                });
                
                element.addEventListener('mouseleave', () => {
                    element.style.outline = '3px solid #ff4444';
                    element.style.backgroundColor = 'rgba(255, 68, 68, 0.1)';
                    element.style.zIndex = '10000';
                });

                // Add click handler
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    scrollElementIntoView(element);
                });

                // Store cleanup function
                element._cleanupHighlight = () => {
                    element.style.outline = originalStyles.outline;
                    element.style.backgroundColor = originalStyles.backgroundColor;
                    element.style.position = originalStyles.position;
                    element.style.zIndex = originalStyles.zIndex;
                    element.style.transition = originalStyles.transition;
                    element.classList.remove('xpath-highlight');
                };
            }
        });
        
        return {
            success: true,
            count: targetElements.length,
            totalMatches: allMatches.length,
            elements: targetElements,
            xpath: successfulXPath || xpath,
            originalXPath: xpath
        };
    } catch (error) {
        console.error('XPath evaluation error:', error);
        return {
            success: false,
            error: error.message,
            xpath: xpath
        };
    }
}

// Helper function to get unique XPath for an element
function getElementXPath(element) {
    if (!element) return '';
    
    // If element has an ID, use that
    if (element.id) return `//*[@id="${element.id}"]`;
    
    // Get element's position among siblings of same type
    let position = 1;
    let sibling = element.previousSibling;
    
    while (sibling) {
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            position++;
        }
        sibling = sibling.previousSibling;
    }
    
    // Recursively build path
    let path = element.tagName.toLowerCase();
    if (position > 1) path += `[${position}]`;
    
    // Get parent path
    if (element.parentNode && element.parentNode.nodeType === 1 && element.parentNode.tagName !== 'BODY') {
        path = getElementXPath(element.parentNode) + '/' + path;
    }
    
    return path;
}

function scrollElementIntoView(element) {
    // Calculate element position
    const rect = element.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    const middle = absoluteTop - (window.innerHeight / 2) + (rect.height / 2);
    
    // Smooth scroll to element
    window.scrollTo({
        top: middle,
        behavior: 'smooth'
    });
    
    // Add temporary focus effect
    element.classList.add('xpath-highlight-active');
    setTimeout(() => {
        element.classList.remove('xpath-highlight-active');
    }, 1500);
}

function clearHighlights() {
    // Remove highlight classes and restore original styles
    document.querySelectorAll('.xpath-highlight').forEach(el => {
        if (el._cleanupHighlight) {
            el._cleanupHighlight();
            delete el._cleanupHighlight;
        }
        
        // Remove event listeners
        el.removeEventListener('mouseenter', () => {});
        el.removeEventListener('mouseleave', () => {});
        el.removeEventListener('click', () => {});
    });
}

// Function to generate Robot Framework script
async function generateRobotScript(xpathDetails) {
    try {
        // Display loading status
        document.getElementById('scriptOutput').value = "Generating Robot Framework script...";
        
        const geminiApiKey = document.getElementById('apiKeyInput').value;
        if (!geminiApiKey) {
            document.getElementById('scriptOutput').value = "Error: Please enter a valid Gemini API key.";
            return;
        }
        
        // Use v1beta endpoint as used by MohanAI instead of v1
        const modelName = "gemini-1.5-flash-latest";
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        
        // Create the prompt for generating Robot Framework script
        const prompt = `Generate a Robot Framework test script using the following XPath details:
${JSON.stringify(xpathDetails, null, 2)}

Requirements:
1. Use proper Robot Framework syntax with *** Settings ***, *** Variables ***, *** Keywords ***, and *** Test Cases *** sections
2. Include necessary library imports like SeleniumLibrary
3. Create a clean, maintainable test case structure
4. Ensure all XPaths are used appropriately in locator strategies
5. Add proper comments for readability
6. Include wait conditions and error handling
7. Format the output as valid Robot Framework syntax without any markdown formatting

The output must be valid Robot Framework code only without any explanations or markdown formatting.`;

        // Format request body to match MohanAI's structure
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
        
        console.log("Calling Gemini API with prompt:", prompt);
        
        const response = await fetch(`${API_URL}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error("Gemini API error:", errorData);
            document.getElementById('scriptOutput').value = 
                `Error generating Robot Framework script: Error: The gemini-1.5-flash-latest model is not available with your API key. This model requires special access permissions in Google AI Studio.`;
            return;
        }
        
        const data = await response.json();
        console.log("Gemini API response:", data);
        
        // Extract and clean the response following MohanAI's approach
        if (data.candidates && data.candidates.length > 0 && 
            data.candidates[0].content && 
            data.candidates[0].content.parts && 
            data.candidates[0].content.parts.length > 0) {
            
            // Get the raw text from the response
            let generatedText = data.candidates[0].content.parts[0].text;
            
            // Clean up any markdown formatting (code fences)
            generatedText = generatedText.trim();
            if (generatedText.startsWith("```") && generatedText.endsWith("```")) {
                generatedText = generatedText.split('\n').slice(1, -1).join('\n');
            } else if (generatedText.startsWith("```robotframework") && generatedText.endsWith("```")) {
                generatedText = generatedText.split('\n').slice(1, -1).join('\n');
            }

            // Validate the script has proper Robot Framework structure
            const requiredSections = ["*** Settings ***", "*** Test Cases ***"];
            const missingRequiredSections = requiredSections.filter(section => 
                !generatedText.includes(section)
            );
            
            if (missingRequiredSections.length > 0) {
                document.getElementById('scriptOutput').value = 
                    `Generated script is missing required Robot Framework sections: ${missingRequiredSections.join(", ")}.\n\nPartial response:\n${generatedText}`;
                return;
            }
            
            document.getElementById('scriptOutput').value = generatedText;
            return;
        }
        
        document.getElementById('scriptOutput').value = "Error: Couldn't generate a valid Robot Framework script from the AI response.";
        
    } catch (error) {
        console.error("Error generating Robot Framework script:", error);
        document.getElementById('scriptOutput').value = `Error generating Robot Framework script: ${error.message}`;
    }
} 

// ✅ NEW: Additional event handlers for comprehensive recording

function handleRecordedDoubleClick(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) {
        console.warn('Could not generate XPath for double click:', el);
        return;
    }
    
    const step = {
        type: 'double_click',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        value: el.textContent?.trim() || el.value || '',
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded double click:', step);
}

function handleRecordedRightClick(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'right_click',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        value: el.textContent?.trim() || el.value || '',
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded right click:', step);
}

function handleRecordedFocus(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const tag = el.tagName.toLowerCase();
    
    // Only record focus for form elements and interactive elements
    if (!['input', 'textarea', 'select', 'button'].includes(tag) && 
        !el.getAttribute('tabindex') && 
        !el.getAttribute('contenteditable')) return;
    
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'focus',
        xpath: `xpath=${reliableXpath}`,
        tag,
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded focus:', step);
}

function handleRecordedBlur(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const tag = el.tagName.toLowerCase();
    
    // Only record blur for form elements
    if (!['input', 'textarea', 'select'].includes(tag)) return;
    
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'blur',
        xpath: `xpath=${reliableXpath}`,
        tag,
        timestamp: Date.now(),
        value: el.value || '',
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded blur:', step);
}

function handleRecordedSubmit(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    // Collect form data
    const formData = new FormData(el);
    const formFields = {};
    for (let [key, value] of formData.entries()) {
        formFields[key] = value;
    }
    
    const step = {
        type: 'form_submit',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        formData: formFields,
        action: el.action || '',
        method: el.method || 'GET',
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded form submit:', step);
}

function handleRecordedReset(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'form_reset',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded form reset:', step);
}

// ✅ Mouse event handlers
function handleRecordedMouseDown(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    // Store mouse down info for potential drag operations
    window._mouseDownInfo = {
        element: event.target,
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now()
    };
}

function handleRecordedMouseUp(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    // Check if this was a drag operation
    if (window._mouseDownInfo) {
        const timeDiff = Date.now() - window._mouseDownInfo.timestamp;
        const distance = Math.sqrt(
            Math.pow(event.clientX - window._mouseDownInfo.x, 2) + 
            Math.pow(event.clientY - window._mouseDownInfo.y, 2)
        );
        
        // If mouse moved significantly and time was reasonable, consider it a drag
        if (distance > 10 && timeDiff > 100) {
            const allPossibleXPaths = getAllXPaths(window._mouseDownInfo.element);
            const reliableXpath = getReliableXPath(allPossibleXPaths);
            
            if (reliableXpath) {
                const step = {
                    type: 'drag',
                    xpath: `xpath=${reliableXpath}`,
                    tag: window._mouseDownInfo.element.tagName.toLowerCase(),
                    timestamp: Date.now(),
                    startX: window._mouseDownInfo.x,
                    startY: window._mouseDownInfo.y,
                    endX: event.clientX,
                    endY: event.clientY,
                    distance: Math.round(distance),
                    duration: timeDiff,
                    elementInfo: allPossibleXPaths.elementInfo,
                    allXPaths: allPossibleXPaths
                };
                
                window.advancedXPathInspector.state.recordedSteps.push(step);
                saveStepsToStorage();
                console.log('✅ Recorded drag operation:', step);
            }
        }
        
        window._mouseDownInfo = null;
    }
}

function handleRecordedMouseOver(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    // Only record hover for elements that might have hover effects
    const el = event.target;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    
    if (!['button', 'a', 'img'].includes(tag) && 
        !['button', 'link', 'menuitem', 'tab'].includes(role) &&
        !el.classList.toString().includes('hover')) return;
    
    // Debounce hover events
    if (window._hoverTimeout) {
        clearTimeout(window._hoverTimeout);
    }
    
    window._hoverTimeout = setTimeout(() => {
        const allPossibleXPaths = getAllXPaths(el);
        const reliableXpath = getReliableXPath(allPossibleXPaths);
        
        if (reliableXpath) {
            const step = {
                type: 'hover',
                xpath: `xpath=${reliableXpath}`,
                tag,
                timestamp: Date.now(),
                elementInfo: allPossibleXPaths.elementInfo,
                allXPaths: allPossibleXPaths
            };
            
            window.advancedXPathInspector.state.recordedSteps.push(step);
            saveStepsToStorage();
            console.log('✅ Recorded hover:', step);
        }
    }, 500); // 500ms delay to avoid too many hover events
}

function handleRecordedMouseOut(event) {
    if (window._hoverTimeout) {
        clearTimeout(window._hoverTimeout);
        window._hoverTimeout = null;
    }
}

// ✅ Drag and drop handlers
function handleRecordedDragStart(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'drag_start',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        dragData: event.dataTransfer ? event.dataTransfer.types : [],
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded drag start:', step);
}

function handleRecordedDragEnd(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'drag_end',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded drag end:', step);
}

function handleRecordedDrop(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'drop',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        dropData: event.dataTransfer ? event.dataTransfer.types : [],
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded drop:', step);
}

// ✅ Touch event handlers for mobile
function handleRecordedTouchStart(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const touch = event.touches[0];
    const step = {
        type: 'touch_start',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        touchX: touch.clientX,
        touchY: touch.clientY,
        touchCount: event.touches.length,
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded touch start:', step);
}

function handleRecordedTouchEnd(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = event.target;
    const allPossibleXPaths = getAllXPaths(el);
    const reliableXpath = getReliableXPath(allPossibleXPaths);
    
    if (!reliableXpath) return;
    
    const step = {
        type: 'touch_end',
        xpath: `xpath=${reliableXpath}`,
        tag: el.tagName.toLowerCase(),
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
    console.log('✅ Recorded touch end:', step);
}

// ✅ Scroll event handler
let scrollTimeout;
function handleRecordedScroll(event) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    // Debounce scroll events
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    
    scrollTimeout = setTimeout(() => {
        const el = event.target === document ? document.documentElement : event.target;
        const allPossibleXPaths = getAllXPaths(el);
        const reliableXpath = getReliableXPath(allPossibleXPaths);
        
        if (!reliableXpath) return;
        
        const step = {
            type: 'scroll',
            xpath: `xpath=${reliableXpath}`,
            tag: el.tagName?.toLowerCase() || 'document',
            timestamp: Date.now(),
            scrollTop: el.scrollTop || window.pageYOffset,
            scrollLeft: el.scrollLeft || window.pageXOffset,
            scrollHeight: el.scrollHeight || document.documentElement.scrollHeight,
            scrollWidth: el.scrollWidth || document.documentElement.scrollWidth,
            elementInfo: allPossibleXPaths.elementInfo,
            allXPaths: allPossibleXPaths
        };
        
        window.advancedXPathInspector.state.recordedSteps.push(step);
        saveStepsToStorage();
        console.log('✅ Recorded scroll:', step);
    }, 250); // 250ms debounce
}
