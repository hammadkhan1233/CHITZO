from flask import Flask, render_template, request
from flask_socketio import SocketIO, send, emit
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'secret')
# cors_allowed_origins="*" is important for Render
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('message')
def handleMessage(msg):
    # Broadcast the message to everyone
    send(msg, broadcast=True)

@socketio.on('typing')
def handle_typing(username):
    # Broadcast that someone is typing, but NOT to the person typing
    emit('typing', username, broadcast=True, include_self=False)

if __name__ == '__main__':
    socketio.run(app)
