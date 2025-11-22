from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import time

# --- FLASK SETUP ---
app = Flask(__name__)
# Generate a random secret key for session management
app.config['SECRET_KEY'] = 'a_secure_and_random_secret_key_12345' 
socketio = SocketIO(app, cors_allowed_origins="*") # Allow all origins for simplicity in development

# --- SERVER STATE MANAGEMENT ---
USERS = {} # {sid: {'name': 'Name', 'age': 25, 'mode': 'none', 'room': None}}
P2P_WAITING = [] # [sid1, sid2, ...] - List of SIDs waiting for P2P match
ROOMS = {} # {room_id: [sid1, sid2, ...]} - Stores active rooms and their members

def get_online_count():
    """Calculates the number of connected clients."""
    # Note: Flask-SocketIO can provide this more directly, but this is a simple check.
    return len(USERS)

def broadcast_stats():
    """Emits the current online user count to everyone."""
    count = get_online_count()
    socketio.emit('server_stats', {'count': count})

# --- FLASK ROUTES ---

@app.route('/')
def index():
    """Serves the main HTML page (login screen)."""
    # Note: Make sure your client JS is named 'chat.js' and is in a 'static' folder.
    return render_template('index.html')

# --- SOCKET.IO HANDLERS ---

@socketio.on('connect')
def handle_connect():
    """Handles new client connections."""
    sid = request.sid
    USERS[sid] = {'name': None, 'age': None, 'mode': 'none', 'room': None}
    print(f"Client connected: {sid}. Total users: {len(USERS)}")
    broadcast_stats()

@socketio.on('disconnect')
def handle_disconnect():
    """Handles client disconnections and cleans up state."""
    sid = request.sid
    user_data = USERS.pop(sid, None)

    if user_data and user_data['room']:
        room_id = user_data['room']
        
        # 1. P2P Cleanup
        if user_data['mode'] == 'p2p':
            if room_id in ROOMS:
                ROOMS[room_id].remove(sid)
                if len(ROOMS[room_id]) == 1:
                    # Notify the remaining partner
                    partner_sid = ROOMS[room_id][0]
                    emit('peer_disconnected', room=partner_sid)
                    
                    # Remove the partner from the room and put them back in waiting
                    partner_data = USERS.get(partner_sid)
                    if partner_data:
                        partner_data['room'] = None
                        partner_data['mode'] = 'p2p'
                        P2P_WAITING.append(partner_sid)
                    
                    del ROOMS[room_id]
                else:
                    # Should not happen in a strict P2P room, but good for safety
                    leave_room(room_id)
        
        # 2. Group Cleanup
        elif user_data['mode'] == 'group':
            leave_room(room_id)
            if room_id in ROOMS:
                ROOMS[room_id].remove(sid)
                # Group room cleanup is often simpler (no need to notify the single partner)

    # 3. Cleanup P2P Waiting List
    if sid in P2P_WAITING:
        P2P_WAITING.remove(sid)

    print(f"Client disconnected: {sid}. Remaining users: {len(USERS)}")
    broadcast_stats()

# --- LOGIN & MODE HANDLERS ---

@socketio.on('login')
def handle_login(data):
    """Stores user information and sends success signal."""
    sid = request.sid
    name = data.get('name', 'Anonymous').strip()
    age = data.get('age')

    if not name or not age:
        return emit('login_error', {'msg': 'Name and Age are required.'})

    if sid in USERS:
        USERS[sid]['name'] = name
        USERS[sid]['age'] = int(age) # Convert to int
        emit('login_success', {'name': name})
    else:
        emit('login_error', {'msg': 'Connection error. Please refresh.'})

@socketio.on('join_p2p')
def handle_join_p2p():
    """Matches two waiting users or adds the user to the waiting list."""
    sid = request.sid
    
    if sid not in USERS or not USERS[sid]['name']:
        return emit('login_error', {'msg': 'Please log in first.'})

    # Clear previous room/mode state
    if USERS[sid]['room']:
        leave_room(USERS[sid]['room'])
        USERS[sid]['room'] = None
    
    # Check if a partner is waiting
    if P2P_WAITING:
        partner_sid = P2P_WAITING.pop(0)
        
        # Ensure partner is still valid and not the current user
        if partner_sid == sid:
            P2P_WAITING.append(partner_sid) # Put back if somehow self-matched
            return emit('p2p_waiting', {'msg': 'Searching for a partner...'})
        
        partner_data = USERS.get(partner_sid)
        if not partner_data:
            return emit('p2p_waiting', {'msg': 'Searching for a partner...'})

        # 1. Create a new room
        room_id = f"p2p_{sid}_{partner_sid}"
        ROOMS[room_id] = [sid, partner_sid]

        # 2. Update state for both users
        USERS[sid].update({'mode': 'p2p', 'room': room_id})
        partner_data.update({'mode': 'p2p', 'room': room_id})

        # 3. Join rooms
        join_room(room_id, sid=sid)
        join_room(room_id, sid=partner_sid)

        # 4. Notify both parties
        emit('p2p_matched', {'room': room_id, 'partner': partner_data['name']}, room=sid)
        emit('p2p_matched', {'room': room_id, 'partner': USERS[sid]['name']}, room=partner_sid)

    else:
        # Add user to waiting list
        if sid not in P2P_WAITING:
            P2P_WAITING.append(sid)
        emit('p2p_waiting', {'msg': 'Searching for a partner...'})

@socketio.on('join_group')
def handle_join_group(data):
    """Joins a user to a regional group room."""
    sid = request.sid
    user_data = USERS.get(sid)
    region = data.get('region', 'global')
    room_id = f"group_{region}"

    if not user_data or not user_data['name']:
        return emit('login_error', {'msg': 'Please log in first.'})

    # Clear previous room/mode state
    if user_data['room']:
        leave_room(user_data['room'])

    # 1. Update state
    user_data.update({'mode': 'group', 'room': room_id})
    
    # 2. Join the new room
    join_room(room_id)
    
    if room_id not in ROOMS:
        ROOMS[room_id] = []
    if sid not in ROOMS[room_id]:
        ROOMS[room_id].append(sid)

    # 3. Notify the user
    emit('group_joined', {'region': region, 'room': room_id}, room=sid)

# --- MESSAGING & SIGNALING ---

@socketio.on('send_message')
def handle_send_message(data):
    """Relays text or audio messages to the room."""
    sid = request.sid
    user_data = USERS.get(sid)
    
    if not user_data or not user_data['room']:
        return # Ignore message if not in a room
        
    room_id = user_data['room']
    name = user_data['name']

    # Text Message
    if 'text' in data:
        message = data['text']
        # Send to sender (isSelf: true)
        emit('message', {'text': message, 'user': name, 'isSelf': True}, room=sid)
        # Send to others in the room (isSelf: false)
        emit('message', {'text': message, 'user': name, 'isSelf': False}, room=room_id, skip_sid=sid)
    
    # Audio Message (Base64)
    elif 'audio' in data:
        audio_data = data['audio']
        # Send to sender (isSelf: true)
        emit('message', {'audio': audio_data, 'user': name, 'isSelf': True}, room=sid)
        # Send to others in the room (isSelf: false)
        emit('message', {'audio': audio_data, 'user': name, 'isSelf': False}, room=room_id, skip_sid=sid)

@socketio.on('signal')
def handle_signal(data):
    """Relays WebRTC signaling data (offer, answer, candidate) between P2P partners."""
    sid = request.sid
    user_data = USERS.get(sid)

    if not user_data or user_data['mode'] != 'p2p' or not user_data['room']:
        return # Only relay signals in active P2P rooms

    room_id = user_data['room']
    
    # Find the recipient (the other user in the P2P room)
    if room_id in ROOMS and len(ROOMS[room_id]) == 2:
        recipient_sid = next(s for s in ROOMS[room_id] if s != sid)
        
        # Relay the signal data directly to the partner
        emit('signal', {'type': data['type'], 'data': data['data']}, room=recipient_sid)
    else:
        # If the partner is missing or the room is invalid, end the call
        emit('peer_disconnected', room=sid)

# --- START APPLICATION ---
if __name__ == '__main__':
    # Flask-SocketIO runs the application
    print("Starting Nexus Connect Server on http://127.0.0.1:5000")
    socketio.run(app, debug=True)
