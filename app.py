from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
socketio = SocketIO(app)

# User queue for matching
user_queue = []

@app.route("/")
def home():
    return render_template("index.html")

# --- WebSocket Events ---

# Event for when a new client connects
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    # Add the new user to the waiting queue
    user_queue.append(request.sid)

    # Try to match the user with another waiting user
    if len(user_queue) >= 2:
        user1 = user_queue.pop(0)
        user2 = user_queue.pop(0)

        # Create a unique room for the two users
        room_id = user1 + user2

        # Join both users to the same room
        join_room(room_id, sid=user1)
        join_room(room_id, sid=user2)

        # Notify the clients that a match has been found
        emit('match_found', {'message': 'You have been matched!'}, room=room_id)
        print(f"Matched {user1} and {user2} in room {room_id}")

# Event for receiving a message from a client
@socketio.on('message')
def handle_message(data):
    room_id = data.get('room')
    message = data.get('message')

    # Broadcast the message to all clients in the same room
    emit('new_message', {'message': message}, room=room_id)

# Event for when a client disconnects
@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    # If the user was in a match, notify the partner
    # (This part requires more advanced logic to find the partner's room)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
