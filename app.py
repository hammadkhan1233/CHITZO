from flask import Flask, render_template
from flask_socketio import SocketIO, send
import os

app = Flask(__name__)
# In production, it is best practice to use environment variables for secret keys
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'chitzo_default_secret')
app.config['DEBUG'] = False

# cors_allowed_origins="*" allows connections from your Render domain
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('message')
def handleMessage(msg):
    print('Message: ' + msg)
    send(msg, broadcast=True)

if __name__ == '__main__':
    # This block is for running locally
    socketio.run(app, host='0.0.0.0', port=5000)
