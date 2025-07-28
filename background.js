// Background service worker for Advanced XPath Tool
// This handles script generation even when the popup is closed

// Listen for messages from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'generateRobotScript') {
        // Start background generation
        generateRobotScriptInBackground(message.data)
            .then(result => {
                // Store the result in Chrome storage
                chrome.storage.local.set({
                    'generatedScript': {
                        script: result.script,
                        modelUsed: result.modelUsed,
                        timestamp: Date.now(),
                        xpathDetails: message.data,
                        completed: true,
                        allXPaths: message.data.allXPaths || null
                    }
                }, () => {
                    // Also store the XPaths separately for persistence
                    if (message.data.allXPaths) {
                        chrome.storage.local.set({
                            'lastXPaths': message.data.allXPaths,
                            'lockedState': {
                                isLocked: true,
                                xpaths: message.data.allXPaths,
                                timestamp: Date.now()
                            }
                        });
                    }
                    
                    // Show notification when complete
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: 'Robot Framework Script Generated',
                        message: 'Your script has been generated successfully! Open the extension to view it.'
                    });
                });
            })
            .catch(error => {
                console.error("Error in background script generation:", error);
                chrome.storage.local.set({
                    'generatedScript': {
                        error: error.message,
                        timestamp: Date.now(),
                        xpathDetails: message.data,
                        completed: true,
                        success: false
                    }
                }, () => {
                    // Show error notification
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: 'Script Generation Failed',
                        message: 'There was an error generating your Robot Framework script. Click to see details.'
                    });
                });
            });
            
        // Send immediate response that background processing has started
        sendResponse({ status: 'processing_started' });
        return true; // Keep the message channel open for async response
    }
    
    // For retrieving generation status
    if (message.action === 'checkScriptGenerationStatus') {
        chrome.storage.local.get('generatedScript', (data) => {
            sendResponse({ status: data.generatedScript || null });
        });
        return true; // Keep the message channel open for async response
    }
});

// Function to generate Robot Framework script in the background
async function generateRobotScriptInBackground(xpathDetails) {
    console.log("Starting background script generation for:", xpathDetails);
    
    // Make sure we have the XPath data
    if (!xpathDetails.allXPaths) {
        console.log("No XPath data available, trying to get it from storage");
        try {
            const lockedStateData = await new Promise(resolve => {
                chrome.storage.local.get(['lockedState'], function(result) {
                    resolve(result.lockedState);
                });
            });
            
            if (lockedStateData && lockedStateData.xpaths) {
                console.log("Retrieved XPaths from storage:", lockedStateData.xpaths);
                xpathDetails.allXPaths = lockedStateData.xpaths;
            }
        } catch (e) {
            console.error("Error retrieving XPaths from storage:", e);
        }
    }
    
    // Update status in storage to indicate processing
    await chrome.storage.local.set({
        'generatedScript': {
            completed: false,
            processing: true,
            timestamp: Date.now(),
            xpathDetails: xpathDetails
        }
    });
    
    try {
        // Get API key from storage
        const apiKeyData = await chrome.storage.local.get('geminiApiKey');
        const geminiApiKey = apiKeyData.geminiApiKey;
        
        if (!geminiApiKey) {
            throw new Error("API key not found. Please enter your Gemini API key in the extension settings.");
        }
        
        // Use v1beta endpoint like MohanAI
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
8. If allXPaths is provided, use those XPaths instead of creating new ones for each step
9. Make sure to use the best locator from allXPaths for each element to ensure reliable tests

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
            
            // Try to parse the error response
            try {
                const errorJson = JSON.parse(errorData);
                if (errorJson.error && errorJson.error.message) {
                    // Format user-friendly error message
                    let errorMessage = `API error: ${errorJson.error.message}`;
                    
                    // Handle common API errors with more friendly messages
                    if (errorJson.error.message.includes("API key not valid")) {
                        errorMessage = "Your API key is not valid. Please check the key and try again.";
                    } else if (errorJson.error.message.includes("permission") || 
                              errorJson.error.message.includes("not authorized") ||
                              errorJson.error.message.includes("access")) {
                        errorMessage = "Your API key doesn't have permission to use gemini-1.5-flash-latest. You need to enable this model in Google AI Studio.";
                    } else if (errorJson.error.message.includes("quota")) {
                        errorMessage = "You've exceeded your API quota. Please check your Google Cloud billing or limits.";
                    }
                    
                    throw new Error(errorMessage);
                }
            } catch (e) {
                // If parsing fails, just use the raw error text
                console.log("Could not parse error JSON:", e);
            }
            
            throw new Error(`The gemini-1.5-flash-latest model returned an error. Please make sure your API key has access to this model.`);
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
                throw new Error(`Generated script is missing required Robot Framework sections: ${missingRequiredSections.join(", ")}.`);
            }
            
            return {
                script: generatedText,
                modelUsed: "gemini-1.5-flash-latest"
            };
        }
        
        throw new Error("Couldn't generate a valid Robot Framework script from the API response.");
        
    } catch (error) {
        console.error("Error in background script generation:", error);
        throw error;
    }
} 

//chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
//     if (request.action === "generateRobotScriptAI") {
//         try {
//             const result = await generateRobotScriptInBackground(request.xpathDetails);
//             sendResponse({ success: true, script: result.script });
//         } catch (error) {
//             console.error("AI Request failed:", error);
//             sendResponse({ success: false, error: error.message });
//         }
//         return true;
//     }
// });

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "enhanceWithAI") {
        try {
            // ✅ Prefer API key from the request, fallback to storage
            const geminiApiKey = request.geminiApiKey || (await chrome.storage.local.get('geminiApiKey')).geminiApiKey;

            if (!geminiApiKey) {
                sendResponse({ success: false, error: "API Key missing." });
                return true;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: request.prompt }] }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Gemini error:", errorText);
                if (response.status === 429) {
                    sendResponse({ success: false, error: "Gemini API quota exceeded (429). Try again later or use a different key." });
                } else {
                    sendResponse({ success: false, error: `AI API returned HTTP error: ${response.status}` });
                }
                return true;
            }

            const data = await response.json();
            if (!data.candidates || !data.candidates[0]) {
                sendResponse({ success: false, error: "No candidates returned from Gemini." });
                return true;
            }

            sendResponse({ success: true, aiResponse: data.candidates[0].content.parts[0].text });
        } catch (error) {
            console.error("Gemini request failed:", error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        console.log('Received PING from popup. Responding with PONG.');
        sendResponse({ pong: true });
    }
    return true;
});




chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('⚠️ Failed to re-inject content.js:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ Re-injected content.js after page load:', tab.url);
      }
    });
  }
});

