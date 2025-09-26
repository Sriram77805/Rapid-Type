# app.py
import os
import random
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Word Lists for Text Generation ---
try:
    # Changed 'words.txt' to 'text.txt'
    with open('text.txt', 'r') as f:
        WORDS = [word.strip() for word in f.readlines()]
except FileNotFoundError:
    WORDS = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "I"] # Fallback words

PUNCTUATION = ['.', ',', ';', ':', '?', '!']
NUMBERS = [str(i) for i in range(10)]

# --- App Configuration ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-super-secret-key-for-this-app'
basedir = os.path.abspath(os.path.dirname(__file__))
instance_path = os.path.join(basedir, 'instance')
os.makedirs(instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(instance_path, 'app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Database and Login Manager Initialization ---
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'
login_manager.login_message = 'Please log in to access this page.'

# --- Database Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    results = db.relationship('TestResult', backref='user', lazy=True)

class TestResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wpm = db.Column(db.Float, nullable=False)
    accuracy = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Authentication Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            flash('Login Unsuccessful. Please check username and password.', 'danger')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user:
            flash('Username already exists. Please choose a different one.', 'warning')
            return redirect(url_for('register'))
        
        hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
        new_user = User(username=username, password_hash=hashed_password)
        db.session.add(new_user)
        db.session.commit()
        flash('Your account has been created! You are now able to log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- Core Application Routes ---
@app.route('/')
def index():
    return render_template('index.html')

# --- API Routes ---
@app.route('/api/get_text')
def get_text():
    mode = request.args.get('mode', 'time')
    count = int(request.args.get('count', 30))
    punc = request.args.get('punctuation') == 'true'
    nums = request.args.get('numbers') == 'true'
    
    word_pool = WORDS.copy()
    if nums:
        word_pool.extend(NUMBERS)

    num_words = 250 if mode == 'time' else count
    text_list = [random.choice(word_pool) for _ in range(num_words)]
    
    if punc:
        for i in range(1, len(text_list)):
            if random.random() < 0.15:
                if not text_list[i-1].endswith(tuple(PUNCTUATION)):
                     text_list[i-1] += random.choice(PUNCTUATION)

    return jsonify({'text': ' '.join(text_list)})


@app.route('/api/save_result', methods=['POST'])
@login_required
def save_result():
    data = request.get_json()
    wpm = data.get('wpm')
    accuracy = data.get('accuracy')
    
    if wpm is None or accuracy is None:
        return jsonify({'status': 'error', 'message': 'Missing data'}), 400

    new_result = TestResult(wpm=wpm, accuracy=accuracy, user_id=current_user.id)
    db.session.add(new_result)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Result saved!'})


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)