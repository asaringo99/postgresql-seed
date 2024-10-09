docker run --name my-postgres -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres
docker cp ./schema.sql my-postgres:/schema.sql
docker exec -it my-postgres psql -U postgres -c "create database my_db;"
docker exec -it my-postgres psql -U postgres -d my_db -f /schema.sql