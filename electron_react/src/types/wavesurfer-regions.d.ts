declare module 'wavesurfer.js/dist/plugins/regions.js' {
    interface RegionParams {
        start: number;
        end: number;
        color?: string;
        loop?: boolean;
        drag?: boolean;
        resize?: boolean;
    }

    export interface RegionsPluginOptions {
        dragSelection?: boolean;
        regions?: RegionParams[];
    }

    const RegionsPlugin: {
        create: (options?: RegionsPluginOptions) => any;
    };

    export default RegionsPlugin;
}
