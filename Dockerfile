FROM node:18-slim AS builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 python3 python-is-python3 make g++ gcc \
    && rm -rf /var/lib/apt/lists/*

RUN npm install
# If you are building your code for production
# RUN npm ci --omit=dev

# Bundle app source
COPY . .
ENV LD_LIBRARY_PATH=/usr/src/app/node_modules/sherpa-onnx-linux-x64:$LD_LIBRARY_PATH

RUN npm run build

FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/static ./dist/src/static

# Write env vars
# Uncomment for x64
ENV LD_LIBRARY_PATH=/usr/src/app/node_modules/sherpa-onnx-linux-x64:$LD_LIBRARY_PATH
# Uncomment for arm64 
# ENV LD_LIBRARY_PATH=/usr/src/app/node_modules/sherpa-onnx-linux-arm64:$LD_LIBRARY_PATH

# Your app binds to port 8080 so you'll use the same port
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "dist/src/app.js" ] 