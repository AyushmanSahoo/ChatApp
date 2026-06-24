FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /app

COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw

COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=build /app/target/chat-app-backend-0.0.1-SNAPSHOT.jar app.jar

ENV PORT=10000

EXPOSE 10000

CMD ["sh", "-c", "java -jar app.jar --server.port=${PORT}"]
