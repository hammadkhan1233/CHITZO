from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random

# --- FLASK SETUP ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a_secure_and_random_secret_key_12345' 
socketio = SocketIO(app, cors_allowed_origins="*")

# --- SERVER STATE MANAGEMENT ---
USERS = {} # {sid: {'name': 'Name', 'age': 25, 'mode': 'none', 'room': None}}
P2P_WAITING = [] # [sid1, sid2, ...] - List of SIDs waiting for P2P match
ROOMS = {} # {room_id: [sid1, sid2, ...]} - Stores active rooms and their members

def get_online_count():
    """Calculates the number of connected clients who have logged in."""
    return sum(1 for user in USERS.values() if user['name'] is not None)

def broadcast_stats():
    """Emits the current online user count to everyone."""
    count = get_online_count()
    socketio.emit('server_stats', {'count': count})

# --- FLASK ROUTES ---

@app.route('/')
def index():
    """Serves the main HTML page (login screen)."""
    return render_template('index.html')

# --- SOCKET.IO HANDLERS ---

@socketio.on('connect')
def handle_connect():
    """Handles new client connections."""
    sid = request.sid
    # Initialize user state immediately upon connection
    USERS[sid] = {'name': None, 'age': None, 'mode': 'none', 'room': None}
    print(f"Client connected: {sid}. Total tracked users: {len(USERS)}")
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
                # Remove the disconnecting user
                ROOMS[room_id].remove(sid)
                
                # Check if only one person remains (the partner)
                if len(ROOMS[room_id]) == 1:
                    partner_sid = ROOMS[room_id][0]
                    emit('peer_disconnected', room=partner_sid) # Notify partner
                    
                    # Clean up partner's state (put them back in the waiting list)
                    partner_data = USERS.get(partner_sid)
                    if partner_data:
                        partner_data.update({'room': None, 'mode': 'p2p'})
                        P2P_WAITING.append(partner_sid)
                    
                    del ROOMS[room_id] # Destroy the P2P room
                
                leave_room(room_id)
        
        # 2. Group Cleanup
        elif user_data['mode'] == 'group':
            leave_room(room_id)
            if room_id in ROOMS and sid in ROOMS[room_id]:
                ROOMS[room_id].remove(sid)

    # 3. Cleanup P2P Waiting List
    if sid in P2P_WAITING:
        P2P_WAITING.remove(sid)

    print(f"Client disconnected: {sid}. Remaining tracked users: {len(USERS)}")
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
        USERS[sid].update({'name': name, 'age': int(age)})
        emit('login_success', {'name': name})
        broadcast_stats() # Update count since a user successfully logged in
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
        USERS[sid].update({'room': None, 'mode': 'none'})
    
    # Check if a partner is waiting
    if P2P_WAITING:
        partner_sid = P2P_WAITING.pop(0)
        
        partner_data = USERS.get(partner_sid)
        if not partner_data:
             # Partner disconnected while waiting, put user back in line
            P2P_WAITING.append(sid)
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
        USERS[sid]['mode'] = 'p2p'
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
        if user_data['room'] in ROOMS and sid in ROOMS[user_data['room']]:
             ROOMS[user_data['room']].remove(sid)

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

# --- MESSAGING ---

@socketio.on('send_message')
def handle_send_message(data):
    """Relays text messages to the room."""
    sid = request.sid
    user_data = USERS.get(sid)
    
    # Only process if it's a text message and the user is in a room
    if not user_data or not user_data['room'] or 'text' not in data:
        return 
        
    room_id = user_data['room']
    name = user_data['name']
    message = data['text']

    # Send to sender (isSelf: true)
    emit('message', {'text': message, 'user': name, 'isSelf': True}, room=sid)
    # Send to others in the room (isSelf: false)
    emit('message', {'text': message, 'user': name, 'isSelf': False}, room=room_id, skip_sid=sid)

# --- START APPLICATION ---
if __name__ == '__main__':
    print("Starting Nexus Connect Server on http://127.0.0.1:5000")
    socketio.run(app, debug=True)
