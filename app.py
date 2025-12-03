from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room, close_room
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# --- Global State ---
# In a real production app with many workers, use Redis. 
# For a single worker (standard free tier), this list works fine.
waiting_queue = [] 
active_pairs = {} # Maps user_sid -> room_id

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def on_connect():
    print(f"User connected: {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    print(f"User disconnected: {sid}")
    
    # Remove from waiting queue if there
    if sid in waiting_queue:
        waiting_queue.remove(sid)
    
    # If in a chat, notify partner
    if sid in active_pairs:
        room_id = active_pairs[sid]
        # Notify the room (which includes the partner)
        emit('partner_left', room=room_id, include_self=False)
        # Cleanup
        del active_pairs[sid]
        # We don't delete the partner's entry yet; they handle their own 'leave' or 'next'

@socketio.on('search')
def on_search():
    sid = request.sid
    
    # If already searching or chatting, ignore
    if sid in waiting_queue:
        return

    # If someone else is waiting
    if len(waiting_queue) > 0:
        partner_sid = waiting_queue.pop(0)
        
        # Create a unique room
        room_id = str(uuid.uuid4())
        
        # Join both to the room
        join_room(room_id, sid=sid)
        join_room(room_id, sid=partner_sid)
        
        # Record the session
        active_pairs[sid] = room_id
        active_pairs[partner_sid] = room_id
        
        # Notify both
        emit('matched', {'room_id': room_id, 'role': 'connector'}, room=room_id)
        
    else:
        # No one waiting, add self to queue
        waiting_queue.append(sid)
        emit('waiting')

@socketio.on('send_message')
def on_message(data):
    sid = request.sid
    msg = data.get('message')
    if sid in active_pairs and msg:
        room_id = active_pairs[sid]
        emit('receive_message', {'message': msg, 'sender': sid}, room=room_id)

@socketio.on('next_partner')
def on_next():
    sid = request.sid
    
    # Leave current room if exists
    if sid in active_pairs:
        room_id = active_pairs[sid]
        leave_room(room_id)
        emit('partner_left', room=room_id, include_self=False)
        del active_pairs[sid]
    
    # Remove from queue if exists (reset)
    if sid in waiting_queue:
        waiting_queue.remove(sid)
        
    # Start searching again immediately
    on_search()

if __name__ == '__main__':
    socketio.run(app, debug=True)
