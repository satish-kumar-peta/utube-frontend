const broker = "broker.hivemq.com";
const port = 8000;
const clientId = "mcq_client_" + Math.random().toString(16).substr(2, 8);
const mqttTopic = "mcq/classroom";
let mqttClient;
let currentQuestion = null;
let questionHistory = [];

const questionInput = document.getElementById('questionInput');
const optionsContainer = document.getElementById('optionsContainer');
const correctOptionsContainer = document.getElementById('correctOptionsContainer');
const submitQuestionBtn = document.getElementById('submitQuestionBtn');
const addOptionBtn = document.getElementById('addOptionBtn');
const broadcastStatus = document.getElementById('broadcastStatus');
const questionList1 = document.getElementById('questionList1');
const answerFeedback1 = document.getElementById('answerFeedback1');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const sendMessageBtn = document.getElementById('sendMessageBtn');

// Initialize UI components
optionsContainer.innerHTML = '<input type="text" placeholder="Option 1">';
questionList1.innerHTML = '<p class="no-question">No active question at the moment.</p>';

// Event Listeners
addOptionBtn.addEventListener('click', addOption);
submitQuestionBtn.addEventListener('click', submitQuestion);
optionsContainer.addEventListener('input', updateCorrectOptions);
sendMessageBtn.addEventListener('click', sendChatMessage);

// Event delegation for MCQ submit buttons
document.addEventListener('click', function(event) {
    if (event.target.matches('[id^="mcq-submitAnswerBtn-"]')) {
        event.preventDefault();
        const questionId = event.target.id.replace('mcq-submitAnswerBtn-', '');
        submitAnswerForQuestion(questionId, 'mcq');
    }
});

// Initialize MQTT connection
window.onload = initializeMQTT;

function initializeMQTT() {
    try {
        mqttClient = new Paho.MQTT.Client(broker, port, clientId);
        mqttClient.onConnectionLost = onConnectionLost;
        mqttClient.onMessageArrived = onMessageArrived;
        mqttClient.connect({
            onSuccess: onConnect,
            onFailure: onFailure,
            keepAliveInterval: 30,
            useSSL: false
        });
        broadcastStatus.textContent = "Connecting to MQTT broker...";
        broadcastStatus.style.color = "orange";
    } catch (error) {
        console.error("Error initializing MQTT:", error);
        broadcastStatus.textContent = "Failed to initialize MQTT client";
        broadcastStatus.style.color = "red";
    }
}

// MQTT Connection Callbacks
function onConnect() {
    console.log("Connected to MQTT broker");
    broadcastStatus.textContent = "Connected to MQTT broker";
    broadcastStatus.style.color = "green";
    mqttClient.subscribe(mqttTopic + "/questions");
    mqttClient.subscribe(mqttTopic + "/chat");
    mqttClient.subscribe(mqttTopic + "/answers");
    publishMessage(mqttTopic + "/request", JSON.stringify({
        action: "get_current_question"
    }));
}

function onFailure(error) {
    console.error("MQTT connection failed:", error);
    broadcastStatus.textContent = "MQTT Connection Failed";
    broadcastStatus.style.color = "red";
    setTimeout(initializeMQTT, 5000);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("MQTT Connection Lost:", responseObject.errorMessage);
        broadcastStatus.textContent = "MQTT Connection Lost";
        broadcastStatus.style.color = "red";
        setTimeout(initializeMQTT, 5000);
    }
}

function onMessageArrived(message) {
    try {
        const topic = message.destinationName;
        const payload = JSON.parse(message.payloadString);
        if (topic === mqttTopic + "/questions") {
            currentQuestion = payload;
            if (!questionHistory.some(q => q.id === payload.id)) {
                questionHistory.push(payload);
            }
            displayMCQQuestions();
            answerFeedback1.textContent = "";
            answerFeedback1.className = "";
        } else if (topic === mqttTopic + "/chat") {
            displayChatMessage(payload.username, payload.message);
        } else if (topic === mqttTopic + "/answers") {
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
        mqttMessage.qos = 1;
        mqttMessage.retained = false;
        mqttClient.send(mqttMessage);
        return true;
    } catch (error) {
        console.error("Error publishing message:", error);
        return false;
    }
}

// UI Functions
function addOption() {
    const optionCount = optionsContainer.querySelectorAll('input').length + 1;
    const optionInput = document.createElement('input');
    optionInput.type = "text";
    optionInput.placeholder = `Option ${optionCount}`;
    optionsContainer.appendChild(optionInput);
    updateCorrectOptions();
}

function updateCorrectOptions() {
    correctOptionsContainer.innerHTML = '<label>Select correct answer(s):</label> <br>';
    const options = Array.from(optionsContainer.querySelectorAll('input'));
    options.forEach((input, index) => {
        if (input.value.trim()) {
            const checkbox = document.createElement('input');
            checkbox.type = "checkbox";
            checkbox.classList.add('correct-option-checkbox');
            checkbox.value = index;
            const label = document.createElement('label');
            label.textContent = `Option ${index + 1}: ${input.value.trim()}`;
            correctOptionsContainer.appendChild(checkbox);
            correctOptionsContainer.appendChild(label);
            correctOptionsContainer.appendChild(document.createElement('br'));
        }
    });
}

function submitQuestion() {
    const question = questionInput.value.trim();
    const optionInputs = Array.from(optionsContainer.querySelectorAll('input'));
    const options = optionInputs.map(input => input.value.trim()).filter(opt => opt);
    const correctOptions = Array.from(document.querySelectorAll('.correct-option-checkbox:checked'))
        .map(checkbox => parseInt(checkbox.value));
    if (!question) {
        alert("Please enter a question");
        return;
    }
    if (options.length < 2) {
        alert("Please add at least 2 options");
        return;
    }
    if (correctOptions.length === 0) {
        alert("Please select at least one correct answer");
        return;
    }
    const questionData = {
        id: "q_" + Date.now(),
        timestamp: new Date().toISOString(),
        question,
        options,
        correctAnswers: correctOptions
    };
    const success = publishMessage(mqttTopic + "/questions", JSON.stringify(questionData));
    if (success) {
        broadcastStatus.textContent = "Question broadcasted successfully!";
        broadcastStatus.style.color = "green";
        resetQuestionForm();
        currentQuestion = questionData;
        if (!questionHistory.some(q => q.id === questionData.id)) {
            questionHistory.push(questionData);
        }
        displayMCQQuestions();
    } else {
        broadcastStatus.textContent = "Failed to broadcast question. Check connection.";
        broadcastStatus.style.color = "red";
    }
}

function resetQuestionForm() {
    questionInput.value = '';
    optionsContainer.innerHTML = '<input type="text" placeholder="Option 1">';
    correctOptionsContainer.innerHTML = '<label>Select correct answer(s):</label>';
    updateCorrectOptions();
}

function displayMCQQuestions() {
    questionList1.innerHTML = '';
    if (questionHistory.length === 0) {
        const noQuestion = document.createElement('p');
        noQuestion.className = 'no-question';
        noQuestion.textContent = 'No active question at the moment.';
        questionList1.appendChild(noQuestion);
        return;
    }
    questionHistory.forEach((questionData, questionIndex) => {
        const questionSection = document.createElement('div');
        questionSection.classList.add('question-section');
        questionSection.style.marginBottom = '20px';
        questionSection.style.padding = '10px';
        questionSection.style.borderBottom = '1px solid #444';
        const questionHeader = document.createElement('h4');
        questionHeader.textContent = questionHistory.length > 1 ? `Question ${questionIndex + 1}` : 'Question';
        questionHeader.style.marginTop = '0';
        questionSection.appendChild(questionHeader);
        const questionElement = document.createElement('div');
        questionElement.classList.add('question');
        questionElement.textContent = questionData.question;
        questionSection.appendChild(questionElement);
        const optionsForm = document.createElement('form');
        optionsForm.id = `mcqForm-${questionData.id}`;
        questionData.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.classList.add('option');
            const checkbox = document.createElement('input');
            checkbox.type = "checkbox";
            checkbox.name = `mcq-option-${questionData.id}`;
            checkbox.id = `option-${questionData.id}-${index}`;
            checkbox.value = index;
            const label = document.createElement('label');
            label.htmlFor = `option-${questionData.id}-${index}`;
            label.textContent = option;
            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(label);
            optionsForm.appendChild(optionDiv);
        });
        const submitBtn = document.createElement('button');
        submitBtn.id = `mcq-submitAnswerBtn-${questionData.id}`;
        submitBtn.className = 'mcq-submit-btn';
        submitBtn.textContent = 'Submit Answer';
        submitBtn.type = 'button';
        questionSection.appendChild(optionsForm);
        questionSection.appendChild(submitBtn);
        const feedbackDiv = document.createElement('div');
        feedbackDiv.id = `feedback-${questionData.id}`;
        feedbackDiv.style.marginTop = '10px';
        questionSection.appendChild(feedbackDiv);
        questionList1.appendChild(questionSection);
    });
}

function submitAnswerForQuestion(questionId, section) {
    const questionData = questionHistory.find(q => q.id === questionId);
    if (!questionData) {
        return;
    }
    const selectedOptions = Array.from(document.querySelectorAll(`input[name="mcq-option-${questionId}"]:checked`))
        .map(checkbox => parseInt(checkbox.value));
    const feedbackDiv = document.querySelector(`#feedback-${questionId}`);
    if (selectedOptions.length === 0) {
        if (feedbackDiv) {
            feedbackDiv.textContent = "Please select an answer!";
            feedbackDiv.className = "";
        }
        return;
    }
    const allCorrect = selectedOptions.every(option => questionData.correctAnswers.includes(option));
    const allSelected = questionData.correctAnswers.every(correct => selectedOptions.includes(correct));
    const isCorrect = allCorrect && allSelected;
    if (feedbackDiv) {
        feedbackDiv.textContent = isCorrect ? "Correct! Well done!" : "Incorrect. Try again!";
        feedbackDiv.className = isCorrect ? "feedback-correct" : "feedback-incorrect";
    }
    publishMessage(mqttTopic + "/answers", JSON.stringify({
        questionId: questionId,
        userId: clientId,
        selectedOptions: selectedOptions,
        isCorrect: isCorrect,
        section: section,
        timestamp: new Date().toISOString()
    }));
}

function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message) {
        const chatMessage = {
            username: "You",
            userId: clientId,
            message: message,
            timestamp: new Date().toISOString()
        };
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
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
    }
});