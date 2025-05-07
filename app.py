from flask import Flask, request, render_template_string
import os

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/')
def index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.route('/upload_audio', methods=['POST'])
def upload_audio():
    if 'audio' in request.files:
        audio = request.files['audio']
        save_path = os.path.join(UPLOAD_FOLDER, audio.filename)
        audio.save(save_path)
        print(f"Zapisano: {save_path}")
    return ('', 204)

if __name__ == '__main__':
    app.run(debug=True)
