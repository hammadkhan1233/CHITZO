const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

// Function to handle the actual sending (same one used by the Send button)
function sendMessage() {
    const message = messageInput.value;
    if (message.trim() !== '') {
        // 1. Send to server/stranger
        // Your_Send_Logic(storedUserName, message);

        // 2. Clear input
        messageInput.value = '';
    }
}

// Event listener for the input field
messageInput.addEventListener('keydown', function(event) {
    // Check if the pressed key is Enter (keyCode 13)
    if (event.key === 'Enter') {
        event.preventDefault(); // Stop the default Enter action (like form submission)
        sendMessage(); // Trigger the message send logic
    }
});

// Optionally, still link the button to the function
sendButton.addEventListener('click', sendMessage);
