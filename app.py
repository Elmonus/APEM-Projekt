from flask import Flask, request, send_from_directory
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
        print(f"Zapisano audio z mikrofonu: {save_path}")
    return ('', 204)

@app.route('/upload_file', methods=['POST'])
def upload_file():
    if 'file' in request.files:
        f = request.files['file']
        save_path = os.path.join(UPLOAD_FOLDER, f.filename)
        f.save(save_path)
        print(f"Zapisano przesłany plik: {save_path}")
    return ('<p>Plik zapisany. <a href="/">Powrót</a></p>')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(debug=True)
