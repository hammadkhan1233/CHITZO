
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
import secrets
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(16)
socketio = SocketIO(app, cors_allowed_origins="*")

# Store active users and messages in memory
users = {}
messages = []
rooms = {'general': []}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in users:
        username = users[sid]['username']
        room = users[sid]['room']
        leave_room(room)
        del users[sid]
        emit('user_left', {
            'username': username,
            'timestamp': datetime.now().strftime('%H:%M')
        }, room=room)
        emit('user_count', {'count': len([u for u in users.values() if u['room'] == room])}, room=room)

@socketio.on('join')
def handle_join(data):
    username = data['username']
    room = data.get('room', 'general')
    
    users[request.sid] = {
        'username': username,
        'room': room
    }
    
    join_room(room)
    
    # Send recent messages to the new user
    room_messages = [msg for msg in messages if msg.get('room') == room]
    emit('load_messages', {'messages': room_messages[-50:]})
    
    # Notify others
    emit('user_joined', {
        'username': username,
        'timestamp': datetime.now().strftime('%H:%M')
    }, room=room, skip_sid=request.sid)
    
    # Send user count
    emit('user_count', {'count': len([u for u in users.values() if u['room'] == room])}, room=room)

@socketio.on('send_message')
def handle_message(data):
    if request.sid not in users:
        return
    
    username = users[request.sid]['username']
    room = users[request.sid]['room']
    message = data['message']
    timestamp = datetime.now().strftime('%H:%M')
    
    message_data = {
        'username': username,
        'message': message,
        'timestamp': timestamp,
        'room': room
    }
    
    messages.append(message_data)
    
    # Keep only last 1000 messages
    if len(messages) > 1000:
        messages.pop(0)
    
    emit('new_message', message_data, room=room)

@socketio.on('typing')
def handle_typing(data):
    if request.sid not in users:
        return
    
    username = users[request.sid]['username']
    room = users[request.sid]['room']
    
    emit('user_typing', {'username': username}, room=room, skip_sid=request.sid)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
