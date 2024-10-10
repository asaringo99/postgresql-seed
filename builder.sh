docker run --name my-postgres -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres
docker cp ./schema.sql my-postgres:/schema.sql
sleep 5
docker exec -it my-postgres psql -U postgres -c "create database my_db;"
sleep 2
docker exec -it my-postgres psql -U postgres -d my_db -f /schema.sql