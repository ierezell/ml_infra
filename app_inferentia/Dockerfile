FROM python:3.7

COPY ./models /models

COPY requirements.txt requirements.txt
RUN pip3 config set global.extra-index-url https://pip.repos.neuron.amazonaws.com
RUN pip3 install torch-neuron neuron-cc[tensorflow] sagemaker transformers --upgrade
RUN pip3 install -r requirements.txt

COPY app.py app.py

CMD ["python3", "app.py"]