/**
 * Загрузка сэмплеров инструментов из public/sound/*.json (sf2-zones)
 * для всех дорожек midi-файла. Возвращает карту realChannel -> Tone.Sampler.
 * Сэмплеры догружаются асинхронно (onload), объект заполняется по мере готовности.
 */
import * as Tone from "tone";
import type { Midi } from "@tonejs/midi";
import * as NoteHandler from "@/components/track/note/NoteHandler";

export type SamplersMap = Record<number, Tone.Sampler>;

export async function loadSamplersForMidi(midi: Midi): Promise<SamplersMap> {
    const samplers: SamplersMap = {};
    const context = Tone.getContext();

    for (const track of midi.tracks) {
        if (track.channel === 9) {
            // ударные: отдельный сэмплер на каждый drum-note
            const notes = NoteHandler.getAllNotesFromChannel(track.channel, midi);
            for (const note of notes) {
                if (note.midi < 35 || note.midi > 81) {
                    continue;
                }
                const drumsChannel = NoteHandler.getRealChannel(track.channel, note);
                if (samplers[drumsChannel] !== undefined) {
                    continue;
                }
                const zones = await NoteHandler.getZonesByMidiDrumsNumber(drumsChannel);
                if (!zones) {
                    continue;
                }
                const sampler = new Tone.Sampler({
                    urls: await NoteHandler.getMappedNotesFromZones(context, zones),
                    onload: () => {
                        samplers[drumsChannel] = sampler;
                    },
                }).toDestination();
                sampler.volume.value = -15;
            }
        } else {
            if (samplers[track.channel] !== undefined) {
                continue;
            }
            const zones = await NoteHandler.getZonesByMidiInstrumentNumber(track.instrument.number);
            if (!zones) {
                continue;
            }
            const sampler = new Tone.Sampler({
                urls: await NoteHandler.getMappedNotesFromZones(context, zones),
                onload: () => {
                    samplers[track.channel] = sampler;
                },
            }).toDestination();
            sampler.volume.value = -15;
        }
    }
    return samplers;
}
