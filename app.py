from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Initialize SocketIO with gevent async_mode automatically
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# --- Global State ---
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
    
    if sid in waiting_queue:
        waiting_queue.remove(sid)
    
    if sid in active_pairs:
        room_id = active_pairs[sid]
        emit('partner_left', room=room_id, include_self=False)
        del active_pairs[sid]

@socketio.on('search')
def on_search():
    sid = request.sid
    if sid in waiting_queue:
        return

    if len(waiting_queue) > 0:
        partner_sid = waiting_queue.pop(0)
        room_id = str(uuid.uuid4())
        
        join_room(room_id, sid=sid)
        join_room(room_id, sid=partner_sid)
        
        active_pairs[sid] = room_id
        active_pairs[partner_sid] = room_id
        
        emit('matched', {'room_id': room_id}, room=room_id)
    else:
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
    if sid in active_pairs:
        room_id = active_pairs[sid]
        leave_room(room_id)
        emit('partner_left', room=room_id, include_self=False)
        del active_pairs[sid]
    
    if sid in waiting_queue:
        waiting_queue.remove(sid)
        
    on_search()

if __name__ == '__main__':
    socketio.run(app, debug=True)
