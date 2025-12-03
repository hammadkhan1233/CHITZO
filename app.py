from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# --- GLOBAL STATE ---
# Queue for 1-on-1 matching: stores (sid, name)
match_queue = []

# Global set for total online count (all users)
connected_users = set()

# Mappings to track user state
sid_to_name = {}    # sid -> name
sid_to_room = {}    # sid -> room_id (used for both 1-on-1 and Group)
sid_to_mode = {}    # sid -> '1on1' or 'group'

GROUP_ROOM_ID = 'global_group_chat'

def broadcast_user_count():
    """Broadcasts the total number of connected users to everyone."""
    count = len(connected_users)
    emit('update_user_count', {'count': count}, broadcast=True)

@app.route("/")
def home():
    return render_template("index.html")

# --- SOCKET EVENTS ---

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    connected_users.add(request.sid)
    broadcast_user_count()

@socketio.on('join_chat')
def handle_join_chat(data):
    """
    Main entry point. 
    data expects: {'name': '...', 'mode': '1on1' or 'group'}
    """
    user_sid = request.sid
    name = data.get('name', 'Stranger')
    mode = data.get('mode', '1on1')
    
    sid_to_name[user_sid] = name
    sid_to_mode[user_sid] = mode

    print(f"User {name} ({user_sid}) joining mode: {mode}")

    if mode == 'group':
        # --- GROUP CHAT LOGIC ---
        join_room(GROUP_ROOM_ID)
        sid_to_room[user_sid] = GROUP_ROOM_ID
        
        # Notify user they joined
        emit('match_found', {'message': 'Welcome to the Global Group Chat! Say hello.'})
        
        # Notify others in group
        emit('new_message', {
            'name': 'System', 
            'message': f'{name} has joined the group.',
            'is_system': True
        }, room=GROUP_ROOM_ID, skip_sid=user_sid)

    else:
        # --- 1-ON-1 LOGIC ---
        # Add to queue
        match_queue.append((user_sid, name))
        emit('match_found', {'message': 'Waiting for a match...'})
        
        # Check if we can match
        if len(match_queue) >= 2:
            user1 = match_queue.pop(0)
            user2 = match_queue.pop(0)
            
            u1_sid, u1_name = user1
            u2_sid, u2_name = user2
            
            room_id = f"{u1_sid}_{u2_sid}"
            
            join_room(room_id, sid=u1_sid)
            join_room(room_id, sid=u2_sid)
            
            sid_to_room[u1_sid] = room_id
            sid_to_room[u2_sid] = room_id
            
            emit('match_found', {'message': f'Matched with {u2_name}!'}, room=u1_sid)
            emit('match_found', {'message': f'Matched with {u1_name}!'}, room=u2_sid)

@socketio.on('message')
def handle_message(data):
    user_sid = request.sid
    room_id = sid_to_room.get(user_sid)
    name = sid_to_name.get(user_sid, 'Stranger')
    msg_content = data.get('message')

    if room_id and msg_content:
        # Broadcast to the room (Group or 1-on-1)
        # We skip_sid so the sender doesn't get their own message back 
        # (since they added it to their UI immediately)
        emit('new_message', {
            'name': name,
            'message': msg_content
        }, room=room_id, skip_sid=user_sid)

@socketio.on('typing')
def handle_typing():
    # Only useful for 1-on-1 usually, but can work for group if desired.
    # For now, let's limit typing indicators to 1-on-1 to avoid group chaos.
    user_sid = request.sid
    mode = sid_to_mode.get(user_sid)
    room_id = sid_to_room.get(user_sid)
    
    if mode == '1on1' and room_id:
        emit('stranger_typing', room=room_id, skip_sid=user_sid)

@socketio.on('stop_typing')
def handle_stop_typing():
    user_sid = request.sid
    mode = sid_to_mode.get(user_sid)
    room_id = sid_to_room.get(user_sid)
    
    if mode == '1on1' and room_id:
        emit('stranger_stopped_typing', room=room_id, skip_sid=user_sid)

@socketio.on('disconnect')
def handle_disconnect():
    global match_queue
    user_sid = request.sid
    
    connected_users.discard(user_sid)
    broadcast_user_count()

    name = sid_to_name.get(user_sid, 'Stranger')
    mode = sid_to_mode.get(user_sid)
    room_id = sid_to_room.get(user_sid)

    # Clean up maps
    if user_sid in sid_to_name: del sid_to_name[user_sid]
    if user_sid in sid_to_mode: del sid_to_mode[user_sid]
    if user_sid in sid_to_room: del sid_to_room[user_sid]

    # Handle Specific Mode Cleanup
    if mode == '1on1':
        # Remove from queue if waiting
        match_queue = [u for u in match_queue if u[0] != user_sid]
        
        # Notify partner if matched
        if room_id:
            emit('user_disconnected', {'message': 'Stranger has disconnected.'}, room=room_id)
            # Remove partner's room mapping so they can rejoin queue cleanly
            # (The frontend will trigger a re-join)
    
    elif mode == 'group':
        if room_id == GROUP_ROOM_ID:
            emit('new_message', {
                'name': 'System',
                'message': f'{name} left the group.',
                'is_system': True
            }, room=GROUP_ROOM_ID)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), allow_unsafe_werkzeug=True)
