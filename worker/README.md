# Scribbles' worker

A small Node program that runs on the owner's VM next to the local models
(Ollama). It asks the Show ME backend for sentences to read, sends each
request to the local model, and posts the model's reply back. It only
connects out: no port is opened on the VM, and nothing connects in.

- It writes no prompt and reads no answer: the backend sends each exact
  request and checks every reply (`backend/reviewer/asks.ts`).
- It is never told who wrote a sentence, and it logs ids and outcomes only,
  never a child's words.
- It runs one model over everything waiting, then the next, so only one
  model is loaded at a time.
- If it stops, or the VM goes down, sentences just wait. Anything it was
  reading is handed out again after 15 minutes.

Nothing here runs until the owner runs these commands on the VM. Turning
Scribbles on ("suggest" or "decide") is a separate step, the owner's call.

## Set up (Ubuntu 24.04, ARM)

Run these on the VM as a user who can use `sudo`. They don't touch the
VM's other app. Ollama gets at most 9 GB of memory, so the other app keeps
the rest.

**1. Ollama, reachable from this machine only (no open port)**

```sh
sudo apt-get update && sudo apt-get install -y docker.io nodejs git
sudo docker run -d --name ollama --restart unless-stopped \
  -p 127.0.0.1:11434:11434 \
  -e OLLAMA_MAX_LOADED_MODELS=1 -e OLLAMA_NUM_PARALLEL=1 \
  --memory 9g --cpu-shares 256 \
  -v ollama:/root/.ollama ollama/ollama:0.40.14
```

**2. The three models** (about 20 GB of disk, once)

```sh
for model in llama-guard3:8b gemma4:e4b qwen3.5:9b; do
  sudo docker exec ollama ollama pull "$model"
done
```

**3. The worker's own user, and the code**

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin scribbles
sudo git clone --depth 1 --filter=blob:none --sparse https://github.com/sporky-jc/showme /opt/showme
sudo git -C /opt/showme sparse-checkout set worker
node --version   # 18 or newer
```

**4. The key and settings, readable only by the worker's user**

The key is the one in the GitHub secret `STAGING_WORKER_KEY` (staging first).
`read -s` keeps it out of the screen and the shell history.

```sh
sudo mkdir -p /etc/scribbles-worker
read -rs -p "Worker key: " KEY && echo "$KEY" | sudo tee /etc/scribbles-worker/key >/dev/null && unset KEY
sudo tee /etc/scribbles-worker/env >/dev/null <<'SETTINGS'
BACKEND_URL=https://<the staging backend's address>
WORKER_KEY_FILE=/etc/scribbles-worker/key
WORKER_NAME=vm
SETTINGS
sudo chown -R scribbles:scribbles /etc/scribbles-worker
sudo chmod 0700 /etc/scribbles-worker && sudo chmod 0400 /etc/scribbles-worker/key /etc/scribbles-worker/env
```

**5. Start it**

```sh
sudo cp /opt/showme/worker/scribbles-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now scribbles-worker
```

## Check on it

```sh
systemctl status scribbles-worker
journalctl -u scribbles-worker -n 50     # ids and outcomes only
```

`model-missing` means a model isn't in Ollama (step 2). `model-not-loading`
means Ollama couldn't load a model within 15 minutes: check memory with
`free -h` and `sudo docker logs --tail 30 ollama`. `backend-error`
means the backend couldn't be reached or refused the key; the worker waits
longer after each one, up to 10 minutes, and carries on by itself.

## Update it

```sh
sudo git -C /opt/showme pull && sudo systemctl restart scribbles-worker
```

## Stop it, or take it all off

```sh
sudo systemctl disable --now scribbles-worker          # stop
sudo rm /etc/systemd/system/scribbles-worker.service && sudo systemctl daemon-reload
sudo rm -rf /etc/scribbles-worker /opt/showme
sudo userdel scribbles
sudo docker rm -f ollama && sudo docker volume rm ollama   # the models too
```

## Settings

| Name | What | Default |
| --- | --- | --- |
| `BACKEND_URL` | The backend's address (https only) | (needed) |
| `WORKER_KEY_FILE` | A file holding only the worker's key | (needed) |
| `WORKER_NAME` | A name for this worker, for its claims | `vm` |
| `OLLAMA_URL` | Where Ollama is | `http://127.0.0.1:11434` |
| `SAFETY_MODEL`, `FIRST_MODEL`, `SECOND_MODEL` | The models | `llama-guard3:8b`, `gemma4:e4b`, `qwen3.5:9b` |

## Tests

`npm test` (no packages to install): against a fake backend and fake
models, no network.
