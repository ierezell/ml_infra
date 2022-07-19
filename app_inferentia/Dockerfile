FROM ubuntu:18.04

LABEL maintainer=" "

RUN apt-get update -y 
RUN apt-get install software-properties-common -y
RUN add-apt-repository ppa:deadsnakes/ppa -y 
RUN apt-get install python3.7 -y
RUN apt-get install -y --no-install-recommends \
    gnupg2 \
    wget \
    python3-pip \
    python3-setuptools \
    && pip3 --no-cache-dir install --upgrade pip

RUN echo "deb https://apt.repos.neuron.amazonaws.com bionic main" > /etc/apt/sources.list.d/neuron.list

# If you are facing certficate error issues, add  `--no-check-certificate` to the following wget line as a flag.
RUN wget -qO - https://apt.repos.neuron.amazonaws.com/GPG-PUB-KEY-AMAZON-AWS-NEURON.PUB | apt-key add -

# Installing Neuron Tools
RUN apt-get update -y && apt-get install  --allow-change-held-packages -y \
    aws-neuron-tools

# Clean up cache
RUN rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Sets up Path for Neuron tools
ENV PATH="/opt/bin/:/opt/aws/neuron/bin:${PATH}"

COPY ./models /models

COPY requirements.txt requirements.txt
RUN python3.7 -m pip install --upgrade pip
RUN python3.7 -m pip install torch-neuron neuron-cc[tensorflow] sagemaker transformers --upgrade --extra-index-url=https://pip.repos.neuron.amazonaws.com
RUN python3.7 -m pip install -r requirements.txt
RUN python3.7 -m pip install gast

COPY app.py app.py

CMD ["python3.7", "app.py"]