from flask import Flask, request, redirect, render_template_string
import os

UPLOAD_FOLDER = 'uploads'

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

HTML = """
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><title>Witaj</title></head>
<body>
    <h1>witam</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="file">
        <button type="submit">Wyślij</button>
    </form>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/upload', methods=['POST'])
def upload_file():
    uploaded_file = request.files['file']
    if uploaded_file.filename != '':
        path = os.path.join(app.config['UPLOAD_FOLDER'], uploaded_file.filename)
        uploaded_file.save(path)
    return redirect('/')

if __name__ == '__main__':
    app.run(debug=True)
