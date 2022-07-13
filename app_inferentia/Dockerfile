FROM 763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-inference-neuron:1.10.2-neuron-py37-sdk1.19.0-ubuntu18.04

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg2 \
    software-properties-common

RUN apt-get install linux-headers-$(uname -r) -y
RUN apt-get install aws-neuron-dkms --allow-change-held-packages -y
RUN apt-get install aws-neuron-tools -y
RUN export PATH=/opt/aws/neuron/bin:$PATH

COPY ./models /models

COPY requirements.txt requirements.txt
RUN pip3 config set global.extra-index-url https://pip.repos.neuron.amazonaws.com
RUN pip3 install torch-neuron neuron-cc[tensorflow] sagemaker transformers --upgrade
RUN pip3 install -r requirements.txt

COPY app.py app.py

CMD ["python3", "app.py"]