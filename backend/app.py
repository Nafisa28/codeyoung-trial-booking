from flask import Flask, jsonify
from flask_cors import CORS
from db import init_db

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])  # Vite dev server default


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
