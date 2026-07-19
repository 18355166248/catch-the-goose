import { Node, Scene, AudioSource, AudioClip, resources } from 'cc';

export type SfxName = 'pick' | 'drop' | 'match' | 'win' | 'lose' | 'honk' | 'shuffle' | 'prop';

/**
 * 轻量音效播放器：单 AudioSource + playOneShot，预加载全部短音效。
 * 微信小游戏首次播放需要用户交互解锁音频上下文；本游戏所有音效都由
 * 点击触发，天然满足该限制，无需额外处理。
 */
export class AudioMan {
    private source: AudioSource;
    private clips = new Map<SfxName, AudioClip>();
    private lastPlay = new Map<SfxName, number>();

    constructor(scene: Scene) {
        const n = new Node('AudioMan');
        n.setParent(scene);
        this.source = n.addComponent(AudioSource);
        this.source.playOnAwake = false;
        const names: SfxName[] = ['pick', 'drop', 'match', 'win', 'lose', 'honk', 'shuffle', 'prop'];
        for (const name of names) {
            resources.load(`audio/${name}`, AudioClip, (err, clip) => {
                if (!err && clip) this.clips.set(name, clip);
            });
        }
    }

    play(name: SfxName, volume = 1) {
        const clip = this.clips.get(name);
        if (!clip) return;
        // 同名音效 60ms 内去重：凑齐道具连续拾取时避免爆音叠加。
        const now = performance.now();
        if (now - (this.lastPlay.get(name) ?? -Infinity) < 60) return;
        this.lastPlay.set(name, now);
        this.source.playOneShot(clip, volume);
    }
}
