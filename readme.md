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

