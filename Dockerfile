FROM node:0.10.38
MAINTAINER Nathan LeClaire <nathan@docker.com>

ENV USER root
RUN useradd -d /home/term -m -s /bin/bash term
RUN echo 'term:term' | chpasswd
RUN mkdir -p /install
# so that executables from modules are added to the path
ENV PATH /install/node_modules/.bin:$PATH
# so that you can 'require' any installed module
ENV NODE_PATH /install/node_modules/

COPY ./package.json /install/package.json

RUN cd /install; npm install; npm install supervisor -g
#npm install forever; npm install nodemon

WORKDIR /src/

EXPOSE 3000

#CMD /bin/bash
ENTRYPOINT ["/bin/bash", "/src/bin/run.sh"]
