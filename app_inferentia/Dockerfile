FROM 763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-inference-neuron:1.10.2-neuron-py37-sdk1.19.0-ubuntu18.04

EXPOSE 8080
COPY ./models /models

COPY requirements.txt requirements.txt
RUN pip3 install -r requirements.txt

COPY app.py app.py

CMD ["python3", "app.py"]