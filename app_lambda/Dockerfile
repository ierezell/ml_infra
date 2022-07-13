FROM public.ecr.aws/lambda/python:3.9

RUN yum install git -y

COPY requirements.txt  .
COPY models  ./models
RUN  pip3 install -r requirements.txt --extra-index-url=https://pip.repos.neuron.amazonaws.com --target "${LAMBDA_TASK_ROOT}"

COPY app.py ${LAMBDA_TASK_ROOT}

CMD [ "app.handler" ] 
