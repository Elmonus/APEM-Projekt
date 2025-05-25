import os
import io
from flask import Flask, request, send_file, render_template_string
from flask_cors import CORS
from pydub import AudioSegment
from werkzeug.utils import secure_filename
import tempfile

app = Flask(__name__)
CORS(app)

# Konfiguracja
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'flac', 'ogg', 'webm', 'm4a', 'aac'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Mapowanie formatów do odpowiednich kodeków
FORMAT_CODECS = {
    'mp3': 'mp3',
    'wav': 'wav',
    'flac': 'flac',
    'ogg': 'ogg',
    'webm': 'webm',
    'm4a': 'mp4',
    'aac': 'aac'
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_audio(audio_data, input_format, output_format):
    """
    Konwertuje audio z jednego formatu na drugi używając pydub
    (Funkcja zachowana dla kompatybilności wstecznej)
    """
    try:
        # Wczytaj audio
        if input_format == 'webm':
            audio = AudioSegment.from_file(io.BytesIO(audio_data), format='webm')
        else:
            audio = AudioSegment.from_file(io.BytesIO(audio_data), format=input_format)
        
        # Konwertuj używając nowej funkcji
        return convert_audio_segment(audio, output_format)
    
    except Exception as e:
        print(f"Błąd konwersji: {str(e)}")
        raise

@app.route('/')
def index():
    """
    Zwraca stronę HTML z interfejsem
    """
    with open('index.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.route('/convert', methods=['POST'])
def convert():
    """
    Endpoint do konwersji audio z opcjonalnym przycinaniem
    """
    try:
        # Sprawdź czy plik został przesłany
        if 'file' not in request.files and 'audio' not in request.files:
            return 'Brak pliku', 400
        
        file = request.files.get('file') or request.files.get('audio')
        target_format = request.form.get('format', 'mp3').lower()
        
        # Pobierz parametry przycinania (opcjonalne)
        trim_start = request.form.get('trim_start', type=float)
        trim_end = request.form.get('trim_end', type=float)
        
        if file.filename == '':
            return 'Brak wybranego pliku', 400
        
        # Sprawdź format docelowy
        if target_format not in FORMAT_CODECS:
            return 'Nieobsługiwany format docelowy', 400
        
        # Odczytaj dane pliku
        file_data = file.read()
        
        # Sprawdź rozmiar pliku
        if len(file_data) > MAX_FILE_SIZE:
            return 'Plik jest zbyt duży (max 50MB)', 400
        
        # Określ format wejściowy
        input_format = None
        if file.filename and '.' in file.filename:
            input_format = file.filename.rsplit('.', 1)[1].lower()
        
        # Dla nagrań z przeglądarki (WebM)
        if not input_format or input_format not in FORMAT_CODECS:
            # Spróbuj wykryć format
            if file.filename.endswith('.webm') or file.content_type == 'audio/webm':
                input_format = 'webm'
            elif file.filename.endswith('.wav') or file.content_type == 'audio/wav':
                input_format = 'wav'
            else:
                # Próba automatycznego wykrycia
                input_format = 'webm'  # Domyślnie dla nagrań z przeglądarki
        
        # Wczytaj audio
        try:
            if input_format == 'webm':
                audio = AudioSegment.from_file(io.BytesIO(file_data), format='webm')
            else:
                audio = AudioSegment.from_file(io.BytesIO(file_data), format=input_format)
        except Exception as e:
            print(f"Błąd wczytywania audio: {str(e)}")
            return f'Błąd wczytywania pliku audio: {str(e)}', 500
        
        # Przytnij audio jeśli podano parametry
        if trim_start is not None and trim_end is not None:
            # Konwersja sekund na milisekundy
            start_ms = int(trim_start * 1000)
            end_ms = int(trim_end * 1000)
            
            # Upewnij się, że wartości są prawidłowe
            start_ms = max(0, start_ms)
            end_ms = min(len(audio), end_ms)
            
            if start_ms < end_ms:
                audio = audio[start_ms:end_ms]
                print(f"Przycięto audio: {trim_start}s - {trim_end}s")
        
        # Konwertuj audio
        try:
            converted_audio = convert_audio_segment(audio, target_format)
        except Exception as e:
            return f'Błąd konwersji: {str(e)}', 500
        
        # Przygotuj nazwę pliku
        if file.filename and file.filename not in ['recording.webm', 'trimmed.wav']:
            base_name = os.path.splitext(secure_filename(file.filename))[0]
        else:
            base_name = 'audio'
        
        # Dodaj informację o przycięciu do nazwy
        if trim_start is not None and trim_end is not None:
            base_name += '_trimmed'
        
        output_filename = f"{base_name}.{target_format}"
        
        # Określ MIME type
        mime_types = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'flac': 'audio/flac',
            'ogg': 'audio/ogg',
            'webm': 'audio/webm'
        }
        mime_type = mime_types.get(target_format, 'audio/mpeg')
        
        # Zwróć przekonwertowany plik
        return send_file(
            io.BytesIO(converted_audio),
            mimetype=mime_type,
            as_attachment=True,
            download_name=output_filename
        )
    
    except Exception as e:
        print(f"Błąd: {str(e)}")
        return f'Błąd serwera: {str(e)}', 500

def convert_audio_segment(audio_segment, output_format):
    """
    Konwertuje AudioSegment do wybranego formatu
    """
    # Ustawienia jakości dla różnych formatów
    export_options = {}
    
    if output_format == 'mp3':
        export_options = {
            'format': 'mp3',
            'bitrate': '192k',
            'parameters': ['-acodec', 'libmp3lame']
        }
    elif output_format == 'flac':
        export_options = {
            'format': 'flac',
            'parameters': ['-compression_level', '5']
        }
    elif output_format == 'ogg':
        export_options = {
            'format': 'ogg',
            'codec': 'libvorbis',
            'parameters': ['-q:a', '5']
        }
    elif output_format == 'wav':
        export_options = {
            'format': 'wav'
        }
    else:
        export_options = {
            'format': output_format
        }
    
    # Eksportuj do nowego formatu
    output_buffer = io.BytesIO()
    audio_segment.export(output_buffer, **export_options)
    output_buffer.seek(0)
    
    return output_buffer.getvalue()

@app.route('/health')
def health():
    """
    Endpoint do sprawdzania czy serwer działa
    """
    return {'status': 'ok'}, 200

if __name__ == '__main__':
    # Upewnij się, że pydub może znaleźć ffmpeg
    # Ustawić ścieżkę do ffmpeg jeśli nie jest w PATH
    # AudioSegment.converter = "C:/path/to/ffmpeg.exe"
    
    app.run(debug=True)