#!/bin/bash

CONTAINER_NAME="my-postgres"
IMAGE_NAME="postgres"


echo "Stopping container: $CONTAINER_NAME"
docker stop $CONTAINER_NAME

echo "Removing container: $CONTAINER_NAME"
docker rm $CONTAINER_NAME

echo "Removing image: $IMAGE_NAME"
docker rmi $IMAGE_NAME

echo "Cleanup complete!"
