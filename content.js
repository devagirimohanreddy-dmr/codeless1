// Advanced XPath Tool - Content Script
// Handles recording, XPath generation, and element inspection

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

// Persistent recording state management
window.addEventListener("spa-navigation", function () {
    maintainRecordingState();
});

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        setTimeout(() => {
            maintainRecordingState();
        }, 100);
    }
});

window.addEventListener('focus', function() {
    setTimeout(() => {
        maintainRecordingState();
    }, 100);
});

function maintainRecordingState() {
    chrome.storage.local.get(['isRecording', 'recordedSteps'], (result) => {
        if (result.isRecording) {
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
                window.advancedXPathInspector.state.isRecording = true;
                window.advancedXPathInspector.state.recordedSteps = result.recordedSteps || [];
            }
            
            detachRecordingListeners();
            attachRecordingListeners();
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    maintainRecordingState();
    initializeRecording();
    initializePersistentRecording();
});

window.addEventListener('load', () => {
    setTimeout(() => {
        maintainRecordingState();
        if (!dynamicContentObserver) {
            initializePersistentRecording();
        }
    }, 500);
});

let inputTimeouts = {};

function initializeRecording() {
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

    chrome.storage.local.get(['isRecording', 'recordedSteps'], ({ isRecording, recordedSteps }) => {
        if (isRecording) {
            window.advancedXPathInspector.state.isRecording = true;
            window.advancedXPathInspector.state.recordedSteps = recordedSteps || [];
            
            if (!window._recordingListenersAttached) {
                attachRecordingListeners();
            }
            
            createRecordingRecoveryMechanism();
        } else {
            // Check for recovery from sessionStorage
            try {
                const sessionRecording = sessionStorage.getItem('xpathRecorderActive');
                const sessionSteps = sessionStorage.getItem('xpathRecorderSteps');
                
                if (sessionRecording === 'true' && sessionSteps) {
                    const recoveredSteps = JSON.parse(sessionSteps);
                    
                    window.advancedXPathInspector.state.isRecording = true;
                    window.advancedXPathInspector.state.recordedSteps = recoveredSteps;
                    
                    chrome.storage.local.set({ 
                        isRecording: true, 
                        recordedSteps: recoveredSteps 
                    });
                    
                    attachRecordingListeners();
                }
            } catch (e) {
                // Ignore recovery errors
            }
        }
    });

    // Initialize form elements
    const initializeSelectElements = () => {
        document.querySelectorAll('select:not([data-recording-initialized])').forEach(select => {
            select.setAttribute('data-recording-initialized', 'true');
            select.addEventListener('change', handleSelectChange, true);
        });
    };

    const initializeRadioElements = () => {
        document.querySelectorAll('input[type=radio]:not([data-recording-initialized])').forEach(radio => {
            radio.setAttribute('data-recording-initialized', 'true');
            radio.addEventListener('click', handleRadioClick, true);
        });
    };
    
    initializeSelectElements();
    initializeRadioElements();
    
    // Periodic re-initialization for dynamic content
    setInterval(() => {
        if (window.advancedXPathInspector?.state?.isRecording) {
            initializeSelectElements();
            initializeRadioElements();
        }
    }, 3000);
}

// Legacy state restoration
chrome.storage.local.get(['isRecording'], ({ isRecording }) => {
    if (isRecording) {
        if (!window.advancedXPathInspector?.state) {
            window.advancedXPathInspector = { state: {} };
        }
        window.advancedXPathInspector.state.isRecording = true;
        attachRecordingListeners();
    }
});

// Initialize inspector state
if (window.advancedXPathInspector) {
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
        // Ignore cleanup errors
    }
}

// Create namespace for extension
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
        HOVER_DELAY: 1000
    }
};

// Initialize inspector
async function initializeInspector() {
    const { state } = window.advancedXPathInspector;
    
    if (state.isInitialized) {
        cleanupEventListeners();
    }
    
    try {
        if (document.readyState !== 'complete') {
            await new Promise(resolve => window.addEventListener('load', resolve));
        }
        
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('mouseout', handleMouseOut, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('contextmenu', handleRightClick, true);
        document.addEventListener('keydown', handleKeyDown, true);

        state.isInitialized = true;
        return true;
    } catch (error) {
        return false;
    }
}

// Restore recorded steps from storage
chrome.storage.local.get(['recordedSteps'], (result) => {
    window.advancedXPathInspector.state.recordedSteps = result.recordedSteps || [];
});

// Event listener management
function cleanupEventListeners() {
    try {
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('mouseout', handleMouseOut, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('contextmenu', handleRightClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
    } catch (error) {
        // Ignore cleanup errors
    }
}

function attachRecordingListeners() {
    if (window._recordingListenersAttached) return;
    
    document.addEventListener('click', handleRecordedClick, true);
    document.addEventListener('input', handleRecordedInput, true);
    document.addEventListener('change', handleRecordedChange, true);
    document.addEventListener('keydown', handleRecordedKeyDown, true);
    document.addEventListener('dblclick', handleRecordedDoubleClick, true);
    document.addEventListener('contextmenu', handleRecordedRightClick, true);
    document.addEventListener('focus', handleRecordedFocus, true);
    document.addEventListener('blur', handleRecordedBlur, true);
    document.addEventListener('submit', handleRecordedSubmit, true);
    document.addEventListener('reset', handleRecordedReset, true);
    document.addEventListener('mousedown', handleRecordedMouseDown, true);
    document.addEventListener('mouseup', handleRecordedMouseUp, true);
    document.addEventListener('mouseover', handleRecordedMouseOver, true);
    document.addEventListener('mouseout', handleRecordedMouseOut, true);
    document.addEventListener('dragstart', handleRecordedDragStart, true);
    document.addEventListener('dragend', handleRecordedDragEnd, true);
    document.addEventListener('drop', handleRecordedDrop, true);
    document.addEventListener('touchstart', handleRecordedTouchStart, true);
    document.addEventListener('touchend', handleRecordedTouchEnd, true);
    document.addEventListener('scroll', handleRecordedScroll, true);
    
    window._recordingListenersAttached = true;
}

function detachRecordingListeners() {
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
}

// Essential missing functions
function handleSelectChange(e) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = e.target;
    const selectedOption = el.options[el.selectedIndex];
    const value = selectedOption?.text || selectedOption?.value || '';
    
    const allPossibleXPaths = getAllXPaths(el);
    const xpath = getReliableXPath(allPossibleXPaths);
    
    if (!xpath) return;
    
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
}

function handleRadioClick(e) {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    const el = e.target;
    const allPossibleXPaths = getAllXPaths(el);
    const xpath = getReliableXPath(allPossibleXPaths);
    
    if (!xpath) return;
    
    const step = {
        type: 'radio',
        xpath: `xpath=${xpath}`,
        tag: el.tagName.toLowerCase(),
        name: el.name || '',
        value: el.value || el.getAttribute('aria-label') || '',
        timestamp: Date.now(),
        elementInfo: allPossibleXPaths.elementInfo,
        allXPaths: allPossibleXPaths
    };
    
    window.advancedXPathInspector.state.recordedSteps.push(step);
    saveStepsToStorage();
}

function createRecordingRecoveryMechanism() {
    if (window.advancedXPathInspector?.state?.isRecording) {
        try {
            sessionStorage.setItem('xpathRecorderActive', 'true');
            sessionStorage.setItem('xpathRecorderSteps', JSON.stringify(window.advancedXPathInspector.state.recordedSteps || []));
        } catch (e) {
            // Ignore sessionStorage errors
        }
    }
}

let dynamicContentObserver = null;

function initializePersistentRecording() {
    setupDynamicContentObserver();
    createRecordingRecoveryMechanism();
}

function setupDynamicContentObserver() {
    if (dynamicContentObserver) {
        dynamicContentObserver.disconnect();
    }
    
    dynamicContentObserver = new MutationObserver((mutations) => {
        let shouldReinitialize = false;
        
        mutations.forEach((mutation) => {
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
        
        if (shouldReinitialize && window.advancedXPathInspector?.state?.isRecording) {
            setTimeout(() => {
                initializeDynamicElements();
            }, 100);
        }
    });
    
    dynamicContentObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });
}

function initializeDynamicElements() {
    if (!window.advancedXPathInspector?.state?.isRecording) return;
    
    document.querySelectorAll('select:not([data-recording-initialized])').forEach(select => {
        select.setAttribute('data-recording-initialized', 'true');
        select.addEventListener('change', handleSelectChange, true);
    });
    
    document.querySelectorAll('input[type=radio]:not([data-recording-initialized])').forEach(radio => {
        radio.setAttribute('data-recording-initialized', 'true');
        radio.addEventListener('click', handleRadioClick, true);
    });
}

function saveStepsToStorage() {
    if (!window.advancedXPathInspector?.state?.recordedSteps) return;
    
    const steps = window.advancedXPathInspector.state.recordedSteps;
    
    chrome.storage.local.set({ 
        recordedSteps: steps,
        lastSaved: Date.now(),
        stepCount: steps.length
    });
}

function getReliableXPath(allPossibleXPaths) {
    if (!allPossibleXPaths) return '';
    
    if (allPossibleXPaths.uniqueXPaths && allPossibleXPaths.uniqueXPaths.length > 0) {
        return allPossibleXPaths.uniqueXPaths[0].xpath;
    }
    
    if (allPossibleXPaths.formXPaths && allPossibleXPaths.formXPaths.length > 0) {
        return allPossibleXPaths.formXPaths[0].xpath;
    }
    
    if (allPossibleXPaths.specializedXPaths && allPossibleXPaths.specializedXPaths.length > 0) {
        return allPossibleXPaths.specializedXPaths[0].xpath;
    }
    
    const categories = ['classBased', 'roleBased', 'textValue', 'parentContext'];
    
    for (const category of categories) {
        if (allPossibleXPaths.xpaths && 
            allPossibleXPaths.xpaths[category] && 
            allPossibleXPaths.xpaths[category].length > 0) {
            return allPossibleXPaths.xpaths[category][0].xpath;
        }
    }
    
    if (allPossibleXPaths.elementInfo && allPossibleXPaths.elementInfo.xpath) {
        return allPossibleXPaths.elementInfo.xpath;
    }
    
    return '';
}

function getAllXPaths(element) {
    if (!element) return null;
    
    try {
        const tagName = element.tagName.toLowerCase();
        const id = element.id;
        const classNames = element.className || '';
        const text = element.textContent.trim();
        const value = element.value;
        const type = element.getAttribute('type');
        const name = element.getAttribute('name');
        const role = element.getAttribute('role');
        const placeholder = element.getAttribute('placeholder');
        
        const basicXPath = getElementXPath(element);
        
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
                xpath: basicXPath
            },
            uniqueXPaths: [],
            formXPaths: [],
            specializedXPaths: [],
            xpaths: {
                classBased: [],
                roleBased: [],
                textValue: [],
                parentContext: []
            }
        };
        
        // Unique identifiers
        if (id) {
            result.uniqueXPaths.push({
                xpath: `//${tagName}[@id="${id}"]`,
                type: 'id'
            });
        }
        
        // Form elements
        if (['input', 'select', 'textarea', 'button'].includes(tagName)) {
            if (name) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@name="${name}"]`,
                    type: 'name'
                });
            }
            
            if (type) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@type="${type}"]`,
                    type: 'type'
                });
            }
            
            if (placeholder) {
                result.formXPaths.push({
                    xpath: `//${tagName}[@placeholder="${placeholder}"]`,
                    type: 'placeholder'
                });
            }
        }
        
        // Class-based XPaths
        if (classNames) {
            const classes = classNames.split(' ').filter(Boolean);
            classes.forEach(cls => {
                result.xpaths.classBased.push({
                    xpath: `//${tagName}[contains(@class, "${cls}")]`,
                    type: 'class'
                });
            });
        }
        
        // Role-based XPaths
        if (role) {
            result.xpaths.roleBased.push({
                xpath: `//${tagName}[@role="${role}"]`,
                type: 'role'
            });
        }
        
        // Text-based XPaths
        if (text && !['input', 'select', 'textarea'].includes(tagName)) {
            result.xpaths.textValue.push({
                xpath: `//${tagName}[text()="${text}"]`,
                type: 'text'
            });
            
            result.xpaths.textValue.push({
                xpath: `//${tagName}[contains(text(), "${text}")]`,
                type: 'contains-text'
            });
        }
        
        // Parent context
        const parent = element.parentElement;
        if (parent && parent.id) {
            result.xpaths.parentContext.push({
                xpath: `//*[@id="${parent.id}"]//${tagName}`,
                type: 'parent-id'
            });
        }
        
        // Fallback
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
        return {
            elementInfo: {
                tagName: element.tagName.toLowerCase(),
                xpath: getElementXPath(element)
            },
            specializedXPaths: [{
                xpath: getElementXPath(element),
                type: 'error-fallback'
            }]
        };
    }
}

function getElementXPath(element) {
    if (!element) return '';
    
    if (element.id) return `//*[@id="${element.id}"]`;
    
    let position = 1;
    let sibling = element.previousSibling;
    
    while (sibling) {
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            position++;
        }
        sibling = sibling.previousSibling;
    }
    
    let path = element.tagName.toLowerCase();
    if (position > 1) path += `[${position}]`;
    
    if (element.parentNode && element.parentNode.nodeType === 1 && element.parentNode.tagName !== 'BODY') {
        path = getElementXPath(element.parentNode) + '/' + path;
    }
    
    return path;
}

// Placeholder functions for event handlers (to be implemented as needed)
function handleRecordedClick(event) { /* Implementation needed */ }
function handleRecordedInput(event) { /* Implementation needed */ }
function handleRecordedChange(event) { /* Implementation needed */ }
function handleRecordedKeyDown(event) { /* Implementation needed */ }
function handleRecordedDoubleClick(event) { /* Implementation needed */ }
function handleRecordedRightClick(event) { /* Implementation needed */ }
function handleRecordedFocus(event) { /* Implementation needed */ }
function handleRecordedBlur(event) { /* Implementation needed */ }
function handleRecordedSubmit(event) { /* Implementation needed */ }
function handleRecordedReset(event) { /* Implementation needed */ }
function handleRecordedMouseDown(event) { /* Implementation needed */ }
function handleRecordedMouseUp(event) { /* Implementation needed */ }
function handleRecordedMouseOver(event) { /* Implementation needed */ }
function handleRecordedMouseOut(event) { /* Implementation needed */ }
function handleRecordedDragStart(event) { /* Implementation needed */ }
function handleRecordedDragEnd(event) { /* Implementation needed */ }
function handleRecordedDrop(event) { /* Implementation needed */ }
function handleRecordedTouchStart(event) { /* Implementation needed */ }
function handleRecordedTouchEnd(event) { /* Implementation needed */ }
function handleRecordedScroll(event) { /* Implementation needed */ }

// Inspector event handlers
function handleMouseOver(event) { /* Implementation needed */ }
function handleMouseOut(event) { /* Implementation needed */ }
function handleClick(event) { /* Implementation needed */ }
function handleRightClick(event) { /* Implementation needed */ }
function handleKeyDown(event) { /* Implementation needed */ }

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        const { state } = window.advancedXPathInspector;
        
        if (request.action === 'toggleInspector') {
            state.isInspectorActive = request.isActive;
            sendResponse({ success: true });
        } else if (request.action === 'startRecording') {
            state.isRecording = true;
            state.recordedSteps = [];
            chrome.storage.local.set({ isRecording: true, recordedSteps: [] });
            attachRecordingListeners();
            sendResponse({ success: true });
        } else if (request.action === 'stopRecording') {
            state.isRecording = false;
            chrome.storage.local.set({ isRecording: false, recordedSteps: state.recordedSteps });
            detachRecordingListeners();
            sendResponse({ success: true });
        }
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    return true;
});

// Initialize
initializeInspector();
