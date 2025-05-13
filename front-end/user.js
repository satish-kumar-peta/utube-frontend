// MQTT client setup
const broker = "broker.hivemq.com";  // Using public MQTT broker for demonstration
const port = 8000;  // Websocket port for MQTT (non-SSL)
const clientId = "mcq_client_" + Math.random().toString(16).substr(2, 8);
const mqttTopic = "mcq/classroom";  // Base topic for all communication
let mqttClient;
let currentQuestion = null;
let questionHistory = []; // Array to store all questions
let submittedQuestions = new Set(); // Track submitted question IDs

// DOM Elements
const questionList = document.getElementById('questionList');
const answerFeedback = document.getElementById('answerFeedback');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const sendMessageBtn = document.getElementById('sendMessageBtn');

// Initialize UI components
questionList.innerHTML = '<p class="no-question">No active question at the moment.</p>';

// Event Listeners
sendMessageBtn.addEventListener('click', sendChatMessage);

// Event delegation for dynamically created submit buttons
document.addEventListener('click', function(event) {
    if (event.target.matches('[id^="chat-submitAnswerBtn-"]')) {
        event.preventDefault();
        const questionId = event.target.id.replace('chat-submitAnswerBtn-', '');
        submitAnswerForQuestion(questionId, 'chat');
    }
});

// Initialize MQTT connection when page loads
window.onload = initializeMQTT;

function initializeMQTT() {
    try {
        // Create MQTT client instance
        mqttClient = new Paho.MQTT.Client(broker, port, clientId);
        
        // Define callback handlers
        mqttClient.onConnectionLost = onConnectionLost;
        mqttClient.onMessageArrived = onMessageArrived;
        
        // Connect to the MQTT broker
        mqttClient.connect({
            onSuccess: onConnect,
            onFailure: onFailure,
            keepAliveInterval: 30,
            useSSL: false
        });
    } catch (error) {
        console.error("Error initializing MQTT:", error);
    }
}

// MQTT Connection Callbacks
function onConnect() {
    console.log("Connected to MQTT broker");
    
    // Subscribe to topics
    mqttClient.subscribe(mqttTopic + "/questions");
    mqttClient.subscribe(mqttTopic + "/chat");
    mqttClient.subscribe(mqttTopic + "/answers");
    
    // Request current question if available
    publishMessage(mqttTopic + "/request", JSON.stringify({
        action: "get_current_question"
    }));
}

function onFailure(error) {
    console.error("MQTT connection failed:", error);
    
    // Attempt reconnection after 5 seconds
    setTimeout(initializeMQTT, 5000);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("MQTT Connection Lost:", responseObject.errorMessage);
        
        // Attempt reconnection after 5 seconds
        setTimeout(initializeMQTT, 5000);
    }
}

function onMessageArrived(message) {
    try {
        const topic = message.destinationName;
        const payload = JSON.parse(message.payloadString);
        
        // Handle different message topics
        if (topic === mqttTopic + "/questions") {
            // New question arrived
            currentQuestion = payload;
            
            // Add to question history if not already there
            if (!questionHistory.some(q => q.id === payload.id)) {
                questionHistory.push(payload);
            }
            
            // Display questions in chat section
            displayChatQuestions();
            
            // Reset feedback
            answerFeedback.textContent = "";
            answerFeedback.className = "";
        } 
        else if (topic === mqttTopic + "/chat") {
            // Chat message arrived
            displayChatMessage(payload.username, payload.message);
        }
        else if (topic === mqttTopic + "/answers") {
            // Handle answer feedback (if needed)
            console.log("Answer received:", payload);
        }
    } catch (error) {
        console.error("Error processing message:", error);
    }
}

// Helper function to publish MQTT messages
function publishMessage(topic, message) {
    try {
        if (!mqttClient || !mqttClient.isConnected()) {
            console.error("MQTT client not connected");
            return false;
        }
        
        const mqttMessage = new Paho.MQTT.Message(message);
        mqttMessage.destinationName = topic;
        mqttMessage.qos = 1;  // Using QoS 1 for at least once delivery
        mqttMessage.retained = false;
        
        mqttClient.send(mqttMessage);
        return true;
    } catch (error) {
        console.error("Error publishing message:", error);
        return false;
    }
}

// UI Functions
function displayChatQuestions() {
    // Clear chat question container
    questionList.innerHTML = '';
    
    if (questionHistory.length === 0) {
        const noQuestion = document.createElement('p');
        noQuestion.className = 'no-question';
        noQuestion.textContent = 'No active question at the moment.';
        questionList.appendChild(noQuestion);
        return;
    }
    
    // Display questions with checkboxes and submit buttons
    questionHistory.forEach((questionData, questionIndex) => {
        // Create question section with header
        const questionSection = document.createElement('div');
        questionSection.classList.add('question-section');
        questionSection.style.marginBottom = '20px';
        questionSection.style.padding = '10px';
        questionSection.style.borderBottom = '1px solid #444';
        
        // Add question number if more than one question
        const questionHeader = document.createElement('h4');
        questionHeader.textContent = questionHistory.length > 1 ? 
            `Question ${questionIndex + 1}` : 'Question';
        questionHeader.style.marginTop = '0';
        questionSection.appendChild(questionHeader);
        
        // Add question text
        const questionElement = document.createElement('div');
        questionElement.classList.add('question');
        questionElement.textContent = questionData.question;
        questionSection.appendChild(questionElement);
        
        // Create options form
        const optionsForm = document.createElement('form');
        optionsForm.id = `mcqForm-${questionData.id}-chat`;
        
        questionData.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.classList.add('option');
            
            const checkbox = document.createElement('input');
            checkbox.type = "checkbox";
            checkbox.name = `mcq-option-${questionData.id}-chat`;
            checkbox.id = `option-${questionData.id}-${index}-chat`;
            checkbox.value = index;
            if (submittedQuestions.has(questionData.id)) {
                checkbox.disabled = true; // Disable if already submitted
            }
            
            const label = document.createElement('label');
            label.htmlFor = `option-${questionData.id}-${index}-chat`;
            label.textContent = option;
            
            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(label);
            optionsForm.appendChild(optionDiv);
        });
        
        // Create submit button for this question
        const submitBtn = document.createElement('button');
        submitBtn.id = `chat-submitAnswerBtn-${questionData.id}`;
        submitBtn.className = 'chat-submit-btn';
        submitBtn.textContent = 'Submit in Chat';
        submitBtn.type = 'button';
        if (submittedQuestions.has(questionData.id)) {
            submitBtn.disabled = true; // Disable if already submitted
        }
        
        questionSection.appendChild(optionsForm);
        questionSection.appendChild(submitBtn);
        
        // Add feedback area for this question
        const feedbackDiv = document.createElement('div');
        feedbackDiv.id = `feedback-${questionData.id}-chat`;
        feedbackDiv.style.marginTop = '10px';
        questionSection.appendChild(feedbackDiv);
        
        // Append to chat question container
        questionList.appendChild(questionSection);
    });
}

function submitAnswerForQuestion(questionId, section) {
    // Prevent submission if already submitted
    if (submittedQuestions.has(questionId)) {
        return;
    }
    
    // Find the question in history
    const questionData = questionHistory.find(q => q.id === questionId);
    if (!questionData) {
        return;
    }
    
    // Get selected options based on section
    const namespace = section === 'chat' ? '-chat' : '';
    const selectedOptions = Array.from(document.querySelectorAll(`input[name="mcq-option-${questionId}${namespace}"]:checked`))
        .map(checkbox => parseInt(checkbox.value));
    
    // Update feedback if no options selected
    const feedbackDiv = document.querySelector(`#feedback-${questionId}${namespace}`);
    if (selectedOptions.length === 0) {
        if (feedbackDiv) {
            feedbackDiv.textContent = "Please select an answer!";
            feedbackDiv.className = "";
        }
        return;
    }
    
    // Mark question as submitted
    submittedQuestions.add(questionId);
    
    // Disable checkboxes and submit button
    document.querySelectorAll(`input[name="mcq-option-${questionId}${namespace}"]`).forEach(checkbox => {
        checkbox.disabled = true;
    });
    const submitBtn = document.querySelector(`#chat-submitAnswerBtn-${questionId}`);
    if (submitBtn) {
        submitBtn.disabled = true;
    }
    
    // Check answer correctness
    const allCorrect = selectedOptions.every(option => 
        questionData.correctAnswers.includes(option)
    );
    
    const allSelected = questionData.correctAnswers.every(correct => 
        selectedOptions.includes(correct)
    );
    
    const isCorrect = allCorrect && allSelected;
    
    // Update feedback div
    if (feedbackDiv) {
        feedbackDiv.textContent = isCorrect ? "Correct! Well done!" : "Incorrect. Try again!";
        feedbackDiv.className = isCorrect ? "feedback-correct" : "feedback-incorrect";
    }

    // Publish answer to MQTT
    publishMessage(mqttTopic + "/answers", JSON.stringify({
        questionId: questionId,
        userId: clientId,
        selectedOptions: selectedOptions,
        isCorrect: isCorrect,
        section: section, // Track which section the answer came from
        timestamp: new Date().toISOString()
    }));
}

function sendChatMessage() {
    const message = chatInput.value.trim();
    
    if (message) {
        const chatMessage = {
            username: "User", // Replace with actual user variable if available
            userId: clientId,
            message: message,
            timestamp: new Date().toISOString()
        };
        // Publish to MQTT
        publishMessage(mqttTopic + "/chat", JSON.stringify(chatMessage));

        chatInput.value = '';
    }
}

function displayChatMessage(username, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    const content = document.createElement('span');
    content.innerHTML = `<strong>${username}:</strong> ${message}`;
    messageElement.appendChild(content);

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
}

chatInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
    }
});