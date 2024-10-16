<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Asistente de Voz Inteligente</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            background-color: #f0f0f0;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }

        #chat-container {
            width: 400px;
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }

        #chat-box {
            padding: 20px;
            height: 400px;
            overflow-y: auto;
            border-bottom: 2px solid #ccc;
        }

        #chat-box p {
            margin: 10px 0;
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
        }

        #chat-box p strong {
            font-weight: bold;
        }

        p:nth-child(even) {
            background-color: #e0f7fa;
            text-align: right;
        }

        p:nth-child(odd) {
            background-color: #ffe0b2;
            text-align: left;
        }

        #controls {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 10px;
            background-color: #fff;
        }

        #start-btn {
            padding: 10px 20px;
            background-color: #007bff;
            border: none;
            color: white;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }

        #start-btn:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>

    <div id="chat-container">
        <div id="chat-box">
            <p><strong>Robot:</strong> ¡Hola! ¿En qué te puedo ayudar hoy?</p>
        </div>
        <div id="controls">
            <button id="start-btn">Hablar</button>
        </div>
    </div>

    <script src="robot.js"></script>
</body>
</html>
