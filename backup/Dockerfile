# Nightly encrypted pg_dump. Same Postgres major version as the database.
FROM postgres:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["schedule"]
