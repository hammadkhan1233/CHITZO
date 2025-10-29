from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Queue for unmatched users (now stores tuples: (sid, name))
user_queue = []

# Mapping of user SID to room ID
user_to_room = {}

# Mapping of user SID to name
sid_to_name = {}

# NEW: Set to track all connected users for online count
connected_users = set()

def broadcast_user_count():
    """Helper function to broadcast the current user count to everyone."""
    count = len(connected_users)
    print(f"Broadcasting user count: {count}")
    emit('update_user_count', {'count': count}, broadcast=True)

@app.route("/")
def home():
    return render_template("index.html")

# --- WebSocket Events ---

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    # NEW: Add user to online set and broadcast
    connected_users.add(request.sid)
    broadcast_user_count()

@socketio.on('join_queue')
def handle_join_queue(data):
    user_sid = request.sid
    user_name = data.get('name', 'Stranger')
    
    print(f"Client {user_sid} ({user_name}) joined queue")
    
    # Add user to queue (if not already in it)
    if not any(user_sid in u for u in user_queue):
        user_queue.append((user_sid, user_name))
        
    sid_to_name[user_sid] = user_name

    if len(user_queue) >= 2:
        user1_data = user_queue.pop(0)
        user2_data = user_queue.pop(0)

        user1_sid, user1_name = user1_data
        user2_sid, user2_name = user2_data

        room_id = user1_sid + user2_sid
        join_room(room_id, sid=user1_sid)
        join_room(room_id, sid=user2_sid)

        user_to_room[user1_sid] = room_id
        user_to_room[user2_sid] = room_id

        # Notify each user about the *other* user
        emit('match_found', {'message': f'You have been matched with {user2_name}!'}, room=user1_sid)
        emit('match_found', {'message': f'You have been matched with {user1_name}!'}, room=user2_sid)
        print(f"Matched {user1_sid} and {user2_sid} in room {room_id}")

@socketio.on('message')
def handle_message(data):
    room_id = user_to_room.get(request.sid)
    user_name = sid_to_name.get(request.sid, 'Stranger')
    message = data.get('message')

    if room_id and message:
        # Emit to the room, but skip the sender (who already added it to their UI)
        emit('new_message', {'message': message, 'name': user_name}, room=room_id, skip_sid=request.sid)

@socketio.on('typing')
def handle_typing():
    room_id = user_to_room.get(request.sid)
    if room_id:
        emit('stranger_typing', room=room_id, skip_sid=request.sid)

@socketio.on('stop_typing')
def handle_stop_typing():
    room_id = user_to_room.get(request.sid)
    if room_id:
        emit('stranger_stopped_typing', room=room_id, skip_sid=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    global user_queue # IMPORTANT FIX
    user_sid = request.sid
    print(f"Client disconnected: {user_sid}")

    # NEW: Remove user from online set
    connected_users.discard(user_sid)

    # Remove from queue if they disconnect before matching
    user_queue = [u for u in user_queue if u[0] != user_sid]

    if user_sid in sid_to_name:
        del sid_to_name[user_sid]

    room_id = user_to_room.get(user_sid)
    if room_id:
        # Notify the other user in the room
        # This will trigger their client's auto-reconnect
        emit('user_disconnected', {'message': 'The other user has disconnected.'}, room=room_id, skip_sid=user_sid)

        # Remove both users from mappings
        del user_to_room[user_sid]
        for user, room in list(user_to_room.items()):
            if room == room_id:
                del user_to_room[user]
                if user in sid_to_name:
                    del sid_to_name[user]
                break
    
    # NEW: Broadcast the new lower count
    broadcast_user_count()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), allow_unsafe_werkzeug=True)
