import logging
import os
from dotenv import load_dotenv
from pathlib import Path

from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, RoomOutputOptions, cli
from livekit.plugins import deepgram, elevenlabs, openai, silero, tavus # Import the Tavus plugin

# Load environment variables from the .env file at the start
# Ensure you have TAVUS_API_KEY, TAVUS_REPLICA_ID, and TAVUS_PERSONA_ID in your .env file
dotenv_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

# Set up logging to see what the agent is doing
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("aura-agent")


# Define the personality and instructions for our agent.
# This class inherits from the base Agent provided by the framework.
class AuraTherapistAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are an AI therapist named Aura. You are empathetic, a great listener, and non-judgmental. "
                         "Your goal is to provide a safe space for the user to express their feelings. "
                         "Keep your responses supportive and relatively concise to encourage the user to continue sharing. "
                         "Do not give medical advice. Start the conversation by introducing yourself and asking how the user is feeling today."
        )

    async def on_enter(self):
        """
        This function is called when the agent first joins the session.
        It generates the initial greeting based on the instructions above.
        """
        logger.info("Aura has entered the session and will now generate a greeting.")
        self.session.generate_reply()


# This is the main entrypoint function that the LiveKit Agent Worker will run.
async def entrypoint(ctx: JobContext):
    logger.info(f"Starting agent job for room: {ctx.room.name}")

    # Configure the AgentSession. This is the core of the framework, where you
    # plug in the STT, LLM, and TTS services.
    session = AgentSession(
        # Voice Activity Detection: Detects when a user starts and stops speaking.
        vad=silero.VAD.load(),

        # Speech-to-Text: Transcribes user's audio into text.
        stt=deepgram.STT(
            model="nova-2",
            language="en-US"
        ),

        # Language Model: Generates intelligent responses.
        llm=openai.LLM(
            model="gpt-4o-mini"
        ),

        # Text-to-Speech: Converts the LLM's text response into audio.
        tts=elevenlabs.TTS(
            voice_id=os.environ.get("ELEVENLABS_VOICE_ID"),
            api_key=os.environ.get("ELEVENLABS_API_KEY")
        ),
    )

    # ------------------------------------------------------------------------
    # VIRTUAL AVATAR INTEGRATION
    # ------------------------------------------------------------------------
    # 1. Create the AvatarSession using the Tavus plugin.
    #    It requires a Replica ID and a Persona ID from your Tavus account.
    logger.info("Setting up Tavus virtual avatar session.")
    avatar = tavus.AvatarSession(
      replica_id=os.environ["TAVUS_REPLICA_ID"],
      persona_id=os.environ["TAVUS_PERSONA_ID"],
    )

    # 2. Start the avatar session. This connects the avatar worker to the room.
    #    The avatar will wait for the agent to produce audio.
    logger.info("Starting avatar session...")
    await avatar.start(session, room=ctx.room)
    logger.info("Avatar session started successfully.")
    # ------------------------------------------------------------------------

    # Add the agent to the session
    agent = AuraTherapistAgent()
    
    # Start the main agent session.
    # This connects the agent to the LiveKit room.
    await session.start(
        agent=agent,
        room=ctx.room,
        # CRITICAL: Disable the agent's direct audio output.
        # The avatar plugin is now responsible for publishing the synchronized
        # audio and video to the room.
        room_output_options=RoomOutputOptions(
            audio_enabled=False,
        ),
    )

    logger.info("Agent session started and is now active.")


# This block allows you to run the agent directly from the command line.
if __name__ == "__main__":
    # The WorkerOptions tells the CLI which function to run (our entrypoint).
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

