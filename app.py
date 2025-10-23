from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Queue for unmatched users
user_queue = []

# Mapping of user SID to room ID
user_to_room = {}

@app.route("/")
def home():
    return render_template("index.html")

# --- WebSocket Events ---

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    user_queue.append(request.sid)

    if len(user_queue) >= 2:
        user1 = user_queue.pop(0)
        user2 = user_queue.pop(0)

        room_id = user1 + user2
        join_room(room_id, sid=user1)
        join_room(room_id, sid=user2)

        user_to_room[user1] = room_id
        user_to_room[user2] = room_id

        emit('match_found', {'message': 'You have been matched!'}, room=room_id)
        print(f"Matched {user1} and {user2} in room {room_id}")

@socketio.on('message')
def handle_message(data):
    room_id = user_to_room.get(request.sid)
    message = data.get('message')

    if room_id and message:
        emit('new_message', {'message': message}, room=room_id)

@socketio.on('disconnect')
def handle_disconnect():
    user_sid = request.sid
    print(f"Client disconnected: {user_sid}")

    if user_sid in user_queue:
        user_queue.remove(user_sid)

    room_id = user_to_room.get(user_sid)
    if room_id:
        emit('user_disconnected', {'message': 'The other user has disconnected.'}, room=room_id, skip_sid=user_sid)

        # Remove both users from the room mapping
        del user_to_room[user_sid]
        for user, room in list(user_to_room.items()):
            if room == room_id:
                del user_to_room[user]
                break

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), allow_unsafe_werkzeug=True)
