# Multi-stage: build with the full Go toolchain, ship a static binary in a
# minimal runtime image -- architecture.md §3.4's "stateless" goal extends
# to the image itself: no session state, nothing durable outside Postgres,
# so this container can be killed and replaced freely.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /manara-server ./cmd/manara-server

FROM alpine:3.20
RUN adduser -D -u 10001 manara
COPY --from=build /manara-server /usr/local/bin/manara-server
USER manara
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/manara-server"]
