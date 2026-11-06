from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.preprocessing.text import Tokenizer
from pydantic import BaseModel , Field
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from keras.models import load_model
from fastapi import FastAPI , HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pickle
import numpy as np
import re


'''
1. We are going to make some constants like:
A. Model path (bigru)
B. Tokenizer path
C. max sequence length
D. Emotion lables
E. Emotion emojis
'''
# A
model_path = 'bigru.model.keras'

# B
tokenizer_path = 'tokenizer.pkl'

# C 
max_sequence_length = 50

# D
emotion_labels = ["sadness", "joy", "love", "anger", "fear", "surprise"]

# E
emotion_emojis = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😲",
}

'''
2. Preprocessing of input text so it matches the formate we used while training 
A. lower casing 
B. remove punctuations and apostrophes 
C. remove extra spaces 
'''

def preprocess_test(text:str)->str:
    text = text.lower()
    text = re.sub(r"'","",text)
    text = re.sub(r"[^a-z0-9\s]"," ",text)
    text = re.sub(r"[\s+]"," ",text)
    return text

'''
3. Request and response schema 
A. Text Input -> Input schema the text sent by user. -done
B. Prediction Response -> Output schema the emotion to predict. -done
C. Health Response (Server health check)
'''

class TextInput(BaseModel):
    text:str = Field(
        ...,
        min_length = 1,
        max_length = 2000,
        description = "The sentence to analyze",
        json_schema_extra = {'example':'I feel so happy and excited'}
    )

class PredictionResponse(BaseModel):
    text:str
    predicted_emotion: str
    confidense : float
    all_probabilities : dict[str , float]

class HealthResponse(BaseModel):
    status : str
    model_loaded : bool


'''
4. Model loading and LifeSPan Management  

Load the model and tokenizer once the server starts up.
'''

df_model = {}

@asynccontextmanager
async def lifespan(app : FastAPI):
    print("Loading the model and tokenizer..")
    df_model['BiGRU'] =  load_model(model_path)

    with open(tokenizer_path , 'rb') as file:
        df_model['Tokenizer'] = pickle.load(file)

    print('Model are loaded successfully.')

    yield #Pause, model is laoded and server is running and at this point model wait karega for request

    df_model.clear() #Ek baar server band ho gaya uske baad model ko memory se hata do.

'''
5. Mount the static files to FastAPI
A. Enable CORS (Cross-Origin Resource Sharing) to allow requests from different origins 
'''
app = FastAPI(
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

app.mount('/static' , StaticFiles(directory = 'static'),name = 'static')

'''
6. API end points 
A. Server UI at homepage ('/')
B. Health Check Endpoint ('/health')
C. Predict Emotion Endpoint ('/predict')
'''

@app.get('/',include_in_schema=False)
def server_ui():
    return FileResponse('static/index.html')

@app.get('/health', response_model=HealthResponse)
def health_check():
    return HealthResponse(status='Server is running..' , model_loaded=bool(df_model))

@app.post('/predict' , response_model=PredictionResponse)
def predict_response(textinput : TextInput):

    BiGRU_model = df_model.get('BiGRU')
    tokenizer_path = df_model.get('Tokenizer')

    if BiGRU_model is None or tokenizer_path is None:
        raise HTTPException(status_code=503,detail='Model is not loaded yet , please try again later.')

    cleaned_text = preprocess_test(textinput.text)
    print(cleaned_text)
    tokenized_text = tokenizer_path.texts_to_sequences([cleaned_text])

    padded_text = pad_sequences(tokenized_text,maxlen = max_sequence_length,padding = 'post' , truncating = 'post')
    # print('hello paji')
    probabilities = BiGRU_model.predict(padded_text)[0]

    top_probability_index = int(np.argmax(probabilities))

    all_probabilities = {
        label : float(prob) for label , prob in zip(emotion_labels,probabilities)
    }

    return PredictionResponse(
        text = textinput.text,
        predicted_emotion = emotion_labels[top_probability_index],
        confidense = probabilities[top_probability_index],
        all_probabilities = all_probabilities
    )

