from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
socketio = SocketIO(app)

# User queue for matching
user_queue = []
# Dictionary to store user's current room
user_to_room = {}

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
        
        # Store the room_id for each user
        user_to_room[user1] = room_id
        user_to_room[user2] = room_id
        
        # Notify the clients that a match has been found and give them their room_id
        emit('match_found', {'message': 'You have been matched!'}, room=room_id)
        print(f"Matched {user1} and {user2} in room {room_id}")

# Event for receiving a message from a client
@socketio.on('message')
def handle_message(data):
    # Get the user's room from our stored dictionary
    room_id = user_to_room.get(request.sid)
    message = data.get('message')

    if room_id:
        # Broadcast the message to all clients in the same room
        emit('new_message', {'message': message}, room=room_id)

# Event for when a client disconnects
@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    user_sid = request.sid

    # If the user was in the queue, remove them
    if user_sid in user_queue:
        user_queue.remove(user_sid)
    
    # If the user was in a chat room, notify their partner
    room_id = user_to_room.get(user_sid)
    if room_id:
        # Notify the remaining user
        emit('user_disconnected', {'message': 'The other user has disconnected.'}, room=room_id, skip_sid=user_sid)
        
        # Clean up the room and user entry
        del user_to_room[user_sid]
        
        # Find the partner and remove their entry too
        for user, room in user_to_room.items():
            if room == room_id:
                del user_to_room[user]
                break

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), allow_unsafe_werkzeug=True)
