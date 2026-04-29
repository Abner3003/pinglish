#conectar na ec2
ssh -o  IdentitiesOnly=yes -i ec2_pinglish.pem ubuntu@18.222.180.171

##remove o container
docker stop pinglish-api
docker rm pinglish-api
docker run -d \
  --name pinglish-api \
  --env-file .env \
  -p 3000:3000 \
  <sua-imagem>

docker stop pinglish-api pinglish-worker-leads pinglish-worker-interactions || true
docker rm pinglish-api pinglish-worker-leads pinglish-worker-interactions || true

docker run --rm \
  --env-file /opt/pinglish/.env \
  644570659382.dkr.ecr.us-east-2.amazonaws.com/pinglish-api:latest \
  npx prisma migrate deploy


  subir
  docker run -d \
  --name pinglish-api \
  --restart always \
  -p 3000:3000 \
  --env-file /opt/pinglish/.env \
  644570659382.dkr.ecr.us-east-2.amazonaws.com/pinglish-api:269d1b75789d019a17cfaeec56a4d54704d95300


subir os workes
docker run -d \
  --name pinglish-worker-leads \
  --restart always \
  --env-file /opt/pinglish/.env \
  644570659382.dkr.ecr.us-east-2.amazonaws.com/pinglish-api:269d1b75789d019a17cfaeec56a4d54704d95300 \
  node dist/jobs/users-events.consumer.js

docker run -d \
  --name pinglish-worker-interactions \
  --restart always \
  --env-file /opt/pinglish/.env \
  644570659382.dkr.ecr.us-east-2.amazonaws.com/pinglish-api:269d1b75789d019a17cfaeec56a4d54704d95300 \
  node dist/jobs/users-events.consumer.js
