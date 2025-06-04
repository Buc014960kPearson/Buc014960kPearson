FROM alpine

WORKDIR /home 

ARG APP=app

COPY ./${APP} ./app

ENTRYPOINT ["./app"]
CMD ["default_arg1", "default_arg2", "default_arg3"]
