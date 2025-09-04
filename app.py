from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Use eventlet async server
socketio = SocketIO(app, async_mode="eventlet")

waiting_users = []
active_pairs = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    sid = request.sid
    if waiting_users:
        partner_sid = waiting_users.pop()
        room = f"room_{sid}_{partner_sid}"
        join_room(room, sid)
        join_room(room, partner_sid)
        active_pairs[sid] = room
        active_pairs[partner_sid] = room
        emit('paired', {'room': room}, to=sid)
        emit('paired', {'room': room}, to=partner_sid)
    else:
        waiting_users.append(sid)

@socketio.on('message')
def handle_message(data):
    room = active_pairs.get(request.sid)
    if room:
        emit('message', data['msg'], to=room)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    room = active_pairs.pop(sid, None)
    if room:
        emit('message', "Stranger disconnected.", to=room)
    else:
        if sid in waiting_users:
            waiting_users.remove(sid)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))  # Render assigns port
    socketio.run(app, host="0.0.0.0", port=port)
