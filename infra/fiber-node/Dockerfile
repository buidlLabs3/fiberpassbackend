FROM nervos/fiber:0.9.0-rc7

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx-light gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY railway-entrypoint.sh /usr/local/bin/fiberpass-railway-entrypoint.sh
COPY nginx.conf.template /etc/nginx/templates/fiberpass.conf.template

RUN chmod +x /usr/local/bin/fiberpass-railway-entrypoint.sh

EXPOSE 8080 8228

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/fiberpass-railway-entrypoint.sh"]
